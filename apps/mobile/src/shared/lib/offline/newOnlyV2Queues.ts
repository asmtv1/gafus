/**
 * NEW-only native offline queue Phase 1. Intentionally has NO send/replay/ACK APIs.
 * Never opens or rewrites pre-v2 AsyncStorage keys or native media files.
 */
export type NewOnlyV2QueueKind = "progress" | "prevention";

export interface V2SessionBinding {
  schemaVersion: 2;
  principalId: string;
  authEpoch: string;
}
export interface V2PendingEvent {
  eventId: string;
  createdAt: number;
  kind: string;
  payload: Record<string, unknown>;
}
interface V2Envelope extends V2SessionBinding {
  entries: V2PendingEvent[];
}
export interface NewOnlyV2Dependencies {
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  secure: {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
  };
  makeId(): string;
  now(): number;
}
export type NewOnlyV2Code =
  | "V2_SESSION_UNVERIFIED"
  | "V2_SESSION_CHANGED"
  | "V2_INVALID_ID"
  | "V2_INVALID_PAYLOAD"
  | "V2_QUARANTINED"
  | "V2_QUEUE_LIMIT";

export class NewOnlyV2Error extends Error {
  constructor(public readonly code: NewOnlyV2Code) {
    super(code);
    this.name = "NewOnlyV2Error";
  }
}

const BINDING_KEY = "gafus-v2-auth-binding";
const OWNER = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS: Record<NewOnlyV2QueueKind, ReadonlySet<string>> = {
  progress: new Set([
    "startStep",
    "pauseStep",
    "resumeStep",
    "resetStep",
    "completeTheoryStep",
    "completePracticeStep",
    "dailyCourseStartStep",
    "dailyCoursePauseStep",
    "dailyCourseResumeStep",
    "dailyCourseResetStep",
    "dailyCourseCompleteStep",
    "saveVideoProgress",
  ]),
  prevention: new Set(["prevention.upsert"]),
};
const PRIVATE_KEY = /(?:access.?token|refresh.?token|password|secret|authorization|jwt|email)/i;
const MAX_EVENTS = 5000;

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function validBinding(v: unknown): v is V2SessionBinding {
  if (!isObject(v)) return false;
  return (
    v.schemaVersion === 2 &&
    typeof v.principalId === "string" &&
    OWNER.test(v.principalId) &&
    typeof v.authEpoch === "string" &&
    UUID_V4.test(v.authEpoch)
  );
}
function validPayload(v: unknown): boolean {
  if (Array.isArray(v)) return v.every(validPayload);
  if (isObject(v))
    return Object.entries(v).every(([k, child]) => !PRIVATE_KEY.test(k) && validPayload(child));
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v))
  );
}
function clonePayload(v: Record<string, unknown>): Record<string, unknown> {
  if (!isObject(v) || !validPayload(v)) throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
  const text = JSON.stringify(v);
  if (typeof text !== "string" || text.length > 65_536) {
    throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
  }
  return JSON.parse(text) as Record<string, unknown>;
}
function parseEnvelope(
  raw: string,
  expected: V2SessionBinding,
  queue: NewOnlyV2QueueKind,
): V2Envelope {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new NewOnlyV2Error("V2_QUARANTINED");
  }
  if (
    !validBinding(v) ||
    v.principalId !== expected.principalId ||
    v.authEpoch !== expected.authEpoch ||
    !("entries" in v) ||
    !Array.isArray(v.entries) ||
    v.entries.length > MAX_EVENTS
  ) {
    throw new NewOnlyV2Error("V2_QUARANTINED");
  }
  const envelope = v as unknown as V2Envelope;
  const seen = new Set<string>();
  for (const e of envelope.entries) {
    if (
      !isObject(e) ||
      typeof e.eventId !== "string" ||
      !UUID_V4.test(e.eventId) ||
      seen.has(e.eventId) ||
      !Number.isSafeInteger(e.createdAt) ||
      typeof e.kind !== "string" ||
      !KINDS[queue].has(e.kind) ||
      !isObject(e.payload) ||
      !validPayload(e.payload)
    ) {
      throw new NewOnlyV2Error("V2_QUARANTINED");
    }
    seen.add(e.eventId);
  }
  return envelope;
}
function keyFor(queue: NewOnlyV2QueueKind, binding: V2SessionBinding): string {
  return `gafus-${queue}-v2:${binding.principalId}:${binding.authEpoch}`;
}

export class NewOnlyV2Queues {
  private active: V2SessionBinding | null = null;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly deps: NewOnlyV2Dependencies) {}

  private async serial<T>(task: () => Promise<T>): Promise<T> {
    const preceding = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preceding;
    try {
      return await task();
    } finally {
      release();
    }
  }
  private uuid(): string {
    const value = this.deps.makeId();
    if (!UUID_V4.test(value)) throw new NewOnlyV2Error("V2_INVALID_ID");
    return value;
  }
  private unchanged(version: number, expected?: V2SessionBinding): boolean {
    return (
      this.generation === version &&
      !!this.active &&
      (!expected ||
        (this.active.principalId === expected.principalId &&
          this.active.authEpoch === expected.authEpoch))
    );
  }

  /** Call ONLY after server-verified full login; never for cached profile. */
  async beginVerifiedLogin(principalId: string): Promise<V2SessionBinding> {
    if (!OWNER.test(principalId)) throw new NewOnlyV2Error("V2_INVALID_ID");
    const version = ++this.generation;
    this.active = null;
    return this.serial(async () => {
      if (version !== this.generation) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      const binding: V2SessionBinding = { schemaVersion: 2, principalId, authEpoch: this.uuid() };
      await this.deps.secure.setItemAsync(BINDING_KEY, JSON.stringify(binding));
      if (version !== this.generation) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      this.active = binding;
      return { ...binding };
    });
  }

  /** Caller must have re-verified the current JWT/session with server first. */
  async restoreVerifiedSession(principalId: string): Promise<boolean> {
    const version = ++this.generation;
    this.active = null;
    if (!OWNER.test(principalId)) return false;
    return this.serial(async () => {
      const raw = await this.deps.secure.getItemAsync(BINDING_KEY);
      if (version !== this.generation || !raw) return false;
      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
        // Untrusted SecureStore parse errors may contain secret values; never report raw.
        // eslint-disable-next-line @gafus/require-client-catch-tracer
      } catch {
        return false;
      }
      if (!validBinding(candidate) || candidate.principalId !== principalId) return false;
      this.active = {
        schemaVersion: 2,
        principalId: candidate.principalId,
        authEpoch: candidate.authEpoch,
      };
      return true;
    });
  }

  /** Ordinary refresh keeps exactly the same verified binding. */
  async revalidateSameSession(principalId: string): Promise<boolean> {
    return this.serial(async () => {
      const binding = this.active;
      if (!binding || binding.principalId !== principalId) return false;
      const raw = await this.deps.secure.getItemAsync(BINDING_KEY);
      let candidate: unknown;
      try {
        candidate = raw ? JSON.parse(raw) : null;
        // Untrusted SecureStore parse errors may contain secret values; never report raw.
        // eslint-disable-next-line @gafus/require-client-catch-tracer
      } catch {
        candidate = null;
      }
      if (
        !validBinding(candidate) ||
        candidate.principalId !== principalId ||
        candidate.authEpoch !== binding.authEpoch
      ) {
        this.active = null;
        ++this.generation;
        return false;
      }
      return true;
    });
  }

  /** Immediate memory fence, then remove ONLY v2 SecureStore binding; v2 queue bytes retained. */
  async endSession(): Promise<void> {
    const version = ++this.generation;
    this.active = null;
    await this.serial(async () => {
      if (version !== this.generation) return;
      await this.deps.secure.deleteItemAsync(BINDING_KEY);
    });
  }
  getVerifiedBinding(): V2SessionBinding | null {
    return this.active ? { ...this.active } : null;
  }

  async getPending(queue: NewOnlyV2QueueKind): Promise<V2PendingEvent[]> {
    const version = this.generation;
    const binding = this.active;
    if (!binding) return [];
    return this.serial(async () => {
      if (!this.unchanged(version, binding)) return [];
      const secureRaw = await this.deps.secure.getItemAsync(BINDING_KEY);
      let secureBinding: unknown;
      try {
        secureBinding = secureRaw ? JSON.parse(secureRaw) : null;
        // Untrusted SecureStore parse errors may contain secret values; never report raw.
        // eslint-disable-next-line @gafus/require-client-catch-tracer
      } catch {
        secureBinding = null;
      }
      if (!this.unchanged(version, binding)) return [];
      if (
        !validBinding(secureBinding) ||
        secureBinding.principalId !== binding.principalId ||
        secureBinding.authEpoch !== binding.authEpoch
      ) {
        this.active = null;
        ++this.generation;
        return [];
      }
      const raw = await this.deps.storage.getItem(keyFor(queue, binding));
      if (!this.unchanged(version, binding)) return [];
      // Another mounted session may rotate SecureStore while AsyncStorage read is pending.
      // Re-attest at the final async boundary before exposing any private queue bytes.
      const finalBindingRaw = await this.deps.secure.getItemAsync(BINDING_KEY);
      let finalBinding: unknown;
      try {
        finalBinding = finalBindingRaw ? JSON.parse(finalBindingRaw) : null;
        // Ignore untrusted parse details: SecureStore text can contain private values.
        // eslint-disable-next-line @gafus/require-client-catch-tracer
      } catch {
        finalBinding = null;
      }
      if (!this.unchanged(version, binding)) return [];
      if (
        !validBinding(finalBinding) ||
        finalBinding.principalId !== binding.principalId ||
        finalBinding.authEpoch !== binding.authEpoch
      ) {
        this.active = null;
        ++this.generation;
        return [];
      }
      if (raw === null) return [];
      const state = parseEnvelope(raw, binding, queue);
      return state.entries.map((event) => ({
        ...event,
        payload: clonePayload(event.payload),
      }));
    });
  }

  /** Fully durable new-only enqueue. No network, ACK or removal path exists here. */
  async enqueue(
    queue: NewOnlyV2QueueKind,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<V2PendingEvent & { ownerId: string; authEpoch: string }> {
    const binding = this.active;
    const version = this.generation;
    if (!binding) throw new NewOnlyV2Error("V2_SESSION_UNVERIFIED");
    if (!KINDS[queue].has(kind)) throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
    const immutablePayload = clonePayload(payload);
    return this.serial(async () => {
      if (!this.unchanged(version, binding)) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      // Re-attest SecureStore binding even after restart, before a durable write.
      const stored = await this.deps.secure.getItemAsync(BINDING_KEY);
      let candidate: unknown;
      try {
        candidate = stored ? JSON.parse(stored) : null;
        // Untrusted SecureStore parse errors may contain secret values; never report raw.
        // eslint-disable-next-line @gafus/require-client-catch-tracer
      } catch {
        candidate = null;
      }
      if (
        !validBinding(candidate) ||
        candidate.principalId !== binding.principalId ||
        candidate.authEpoch !== binding.authEpoch
      )
        throw new NewOnlyV2Error("V2_SESSION_UNVERIFIED");
      if (!this.unchanged(version, binding)) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      const key = keyFor(queue, binding);
      const previous = await this.deps.storage.getItem(key);
      if (!this.unchanged(version, binding)) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      const envelope: V2Envelope =
        previous === null ? { ...binding, entries: [] } : parseEnvelope(previous, binding, queue);
      if (envelope.entries.length >= MAX_EVENTS) throw new NewOnlyV2Error("V2_QUEUE_LIMIT");
      const entry: V2PendingEvent = {
        eventId: this.uuid(),
        createdAt: this.deps.now(),
        kind,
        payload: immutablePayload,
      };
      if (!Number.isSafeInteger(entry.createdAt)) throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
      if (!this.unchanged(version, binding)) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      await this.deps.storage.setItem(
        key,
        JSON.stringify({
          ...binding,
          entries: [...envelope.entries, entry],
        }),
      );
      if (!this.unchanged(version, binding)) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      return {
        ...entry,
        payload: clonePayload(entry.payload),
        ownerId: binding.principalId,
        authEpoch: binding.authEpoch,
      };
    });
  }
}

export function createNewOnlyV2Queues(deps: NewOnlyV2Dependencies): NewOnlyV2Queues {
  return new NewOnlyV2Queues(deps);
}

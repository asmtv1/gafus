import { validVideoId, validVideoSnapshot, verifyVideoAck, type VideoJournalPreview, type VideoProgressSnapshot } from "./videoJournalContract";
import { verifyTimerAck, type TimerJournalPreview } from "./timerJournalContract";
import { stepJournalResource, validProgressVersion } from "./journalVersionFields";
import { verifyDailyJournalAck, type DailyJournalPreview } from "./dailyJournalContract";
import { evaluatePracticeJournalResponse, type PracticeJournalPreview } from "./newOnlyV2PracticeContract";
import { evaluatePreventionJournalContract, type PreventionContractPreview } from "./newOnlyV2PreventionContract";
/**
 * Owner/epoch-scoped native offline queue. Only explicitly verified journal ACKs may remove events.
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
  videoSnapshots?: Record<string, VideoProgressSnapshot>;
}
export interface NewOnlyV2Dependencies {
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    /** Native storage may enumerate existing owner-scoped envelopes for recovery. */
    getAllKeys?(): Promise<readonly string[]>;
    removeItem?(key: string): Promise<void>;
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
  if (envelope.videoSnapshots !== undefined && (!isObject(envelope.videoSnapshots) ||
      Object.keys(envelope.videoSnapshots).length > 500 ||
      Object.entries(envelope.videoSnapshots).some(([id, snapshot]) => !validVideoId(id) || !validVideoSnapshot(snapshot))))
    throw new NewOnlyV2Error("V2_QUARANTINED");
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
function withVideoSnapshot(envelope: V2Envelope, id: string, snapshot: VideoProgressSnapshot): V2Envelope {
  const entries = Object.entries(envelope.videoSnapshots ?? {}).filter(([key]) => key !== id);
  return { ...envelope, videoSnapshots: Object.fromEntries([...entries, [id, snapshot]].slice(-500)) };
}
function keyFor(queue: NewOnlyV2QueueKind, binding: V2SessionBinding): string {
  return `gafus-${queue}-v2:${binding.principalId}:${binding.authEpoch}`;
}

export class NewOnlyV2Queues {
  private active: V2SessionBinding | null = null;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();
  private readonly pendingListeners = new Set<() => void>();
  /** Notify only after the new immutable entry is durably published. */
  subscribePendingWrites(listener: () => void): () => void {
    this.pendingListeners.add(listener);
    return () => { this.pendingListeners.delete(listener); };
  }
  private readonly practiceAcknowledgements = new Set<string>();
  private readonly practiceListeners = new Set<() => void>();
  subscribePracticeAcknowledgements(listener: () => void): () => void {
    this.practiceListeners.add(listener);
    return () => { this.practiceListeners.delete(listener); };
  }
  wasPracticeAcknowledged(eventId: string, binding: V2SessionBinding): boolean {
    return this.active?.principalId === binding.principalId &&
      this.active.authEpoch === binding.authEpoch && this.practiceAcknowledgements.has(eventId);
  }
  private readonly preventionAcknowledgements = new Set<string>();
  private readonly preventionListeners = new Set<() => void>();

  subscribePreventionAcknowledgements(listener: () => void): () => void {
    this.preventionListeners.add(listener);
    return () => { this.preventionListeners.delete(listener); };
  }
  wasPreventionAcknowledged(eventId: string, binding: V2SessionBinding): boolean {
    return this.active?.principalId === binding.principalId &&
      this.active.authEpoch === binding.authEpoch && this.preventionAcknowledgements.has(eventId);
  }

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

  /**
   * Called exclusively after verified profile, before exposing the new epoch.
   * Publish the complete destination before clearing sources. A crash between
   * those writes leaves duplicate immutable event IDs, which the next restore
   * merges before permitting any replay. Ownerless keys are never opened.
   */
  private async recoverOwnedQueues(binding: V2SessionBinding, version: number): Promise<void> {
    if (!this.deps.storage.getAllKeys) return;
    const check = async () => {
      if (version !== this.generation) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      const raw = await this.deps.secure.getItemAsync(BINDING_KEY);
      let stored: unknown;
      try { stored = raw ? JSON.parse(raw) : null; } catch {
        throw new NewOnlyV2Error("V2_SESSION_UNVERIFIED");
      }
      if (version !== this.generation || !validBinding(stored) ||
          stored.principalId !== binding.principalId || stored.authEpoch !== binding.authEpoch)
        throw new NewOnlyV2Error("V2_SESSION_CHANGED");
    };
    await check();
    const keys = await this.deps.storage.getAllKeys();
    await check();
    for (const kind of ["progress", "prevention"] as const) {
      const prefix = `gafus-${kind}-v2:${binding.principalId}:`;
      const target = keyFor(kind, binding);
      const scoped = [...new Set(keys.filter(key =>
        key.startsWith(prefix) && UUID_V4.test(key.slice(prefix.length))))];
      if (!scoped.some(key => key !== target)) continue;
      if (scoped.length > 1000) throw new NewOnlyV2Error("V2_QUEUE_LIMIT");
      const sources: { key: string; envelope: V2Envelope }[] = [];
      for (const key of [...new Set([target, ...scoped])]) {
        await check();
        const raw = await this.deps.storage.getItem(key);
        if (raw === null) continue;
        const epoch = key.slice(prefix.length);
        const envelope = parseEnvelope(raw, { ...binding, authEpoch: epoch }, kind);
        if (envelope.entries.length) sources.push({ key, envelope });
      }
      if (!sources.some(source => source.key !== target)) {
        if (this.deps.storage.removeItem) {
          for (const key of scoped) if (key !== target) {
            await check();
            await this.deps.storage.removeItem(key);
          }
        }
        continue;
      }
      const merged = new Map<string, V2PendingEvent>();
      for (const { envelope } of sources) {
        for (const entry of envelope.entries) {
          const previous = merged.get(entry.eventId);
          if (previous && JSON.stringify(previous) !== JSON.stringify(entry))
            throw new NewOnlyV2Error("V2_QUARANTINED");
          merged.set(entry.eventId, entry);
        }
      }
      if (merged.size > MAX_EVENTS) throw new NewOnlyV2Error("V2_QUEUE_LIMIT");
      let entries: V2PendingEvent[];
      if (kind === "progress") {
        // Prior migrations can leave identical prefixes/copies. Never invent
        // chronology between distinct historical timer histories using a
        // device wall clock. Preserve every source if no common ordering is
        // provable from one complete durable snapshot.
        const full = sources.find(source => source.envelope.entries.length === merged.size);
        if (!full) throw new NewOnlyV2Error("V2_QUARANTINED");
        const positions = new Map(full.envelope.entries.map((event, index) => [event.eventId, index]));
        if (sources.some(source => {
          let position = -1;
          return source.envelope.entries.some(event => {
            const next = positions.get(event.eventId);
            if (next === undefined || next <= position) return true;
            position = next;
            return false;
          });
        })) throw new NewOnlyV2Error("V2_QUARANTINED");
        entries = full.envelope.entries;
      } else {
        // Prevention journal operations create immutable records independently.
        entries = [...merged.values()];
      }
      await check();
      await this.deps.storage.setItem(target, JSON.stringify({ ...binding, entries }));
      // The new epoch is still inaccessible. Do not publish it until every
      // copied source is cleared; otherwise an ACK could resurrect a copy.
      for (const { key, envelope } of sources) {
        if (key === target) continue;
        await check();
        if (this.deps.storage.removeItem) await this.deps.storage.removeItem(key);
        else await this.deps.storage.setItem(key, JSON.stringify({ ...envelope, entries: [] }));
      }
      await check();
    }
  }

  /** Call ONLY after server-verified full login; never for cached profile. */
  async beginVerifiedLogin(principalId: string): Promise<V2SessionBinding> {
    if (!OWNER.test(principalId)) throw new NewOnlyV2Error("V2_INVALID_ID");
    const version = ++this.generation;
    this.active = null;
    this.preventionAcknowledgements.clear();
    this.practiceAcknowledgements.clear();
    return this.serial(async () => {
      if (version !== this.generation) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      const binding: V2SessionBinding = { schemaVersion: 2, principalId, authEpoch: this.uuid() };
      await this.deps.secure.setItemAsync(BINDING_KEY, JSON.stringify(binding));
      await this.recoverOwnedQueues(binding, version);
      if (version !== this.generation) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      this.active = binding;
      return { ...binding };
    });
  }

  /** Caller must have re-verified the current JWT/session with server first. */
  async restoreVerifiedSession(principalId: string): Promise<boolean> {
    const version = ++this.generation;
    this.active = null;
    this.preventionAcknowledgements.clear();
    this.practiceAcknowledgements.clear();
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
      const binding: V2SessionBinding = {
        schemaVersion: 2,
        principalId: candidate.principalId,
        authEpoch: candidate.authEpoch,
      };
      await this.recoverOwnedQueues(binding, version);
      if (version !== this.generation) return false;
      this.active = binding;
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
    this.preventionAcknowledgements.clear();
    this.practiceAcknowledgements.clear();
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

  /** Only exact authenticated POST receipts authorize removal, never lookup alone. */
  acknowledgePrevention(binding: V2SessionBinding, event: V2PendingEvent,
    preview: PreventionContractPreview, response: unknown, isCurrent: () => boolean) {
    return this.acknowledge("prevention", binding, event, isCurrent, stored =>
      evaluatePreventionJournalContract(preview, binding, stored, "post", 200, response).status === "confirmed");
  }

  acknowledgePractice(binding: V2SessionBinding, event: V2PendingEvent,
    preview: PracticeJournalPreview, response: unknown, isCurrent: () => boolean) {
    if (!preview.post.body.expectedStepOnDayId || !preview.post.body.expectedStepId)
      return Promise.resolve(false);
    return this.acknowledge("progress", binding, event, isCurrent, stored =>
      evaluatePracticeJournalResponse(preview, binding, stored, "post", 200, response).status === "confirmed");
  }

  acknowledgeDaily(binding: V2SessionBinding, event: V2PendingEvent,
    preview: DailyJournalPreview, response: unknown, isCurrent: () => boolean) {
    return this.acknowledge("progress", binding, event, isCurrent, stored =>
      verifyDailyJournalAck(preview, binding, stored, response));
  }

  acknowledgeTimer(binding: V2SessionBinding, event: V2PendingEvent,
    preview: TimerJournalPreview, response: unknown, isCurrent: () => boolean) {
    return this.acknowledge("progress", binding, event, isCurrent, stored =>
      verifyTimerAck(preview, binding, stored, response));
  }

  acknowledgeVideo(binding: V2SessionBinding, event: V2PendingEvent,
    preview: VideoJournalPreview, response: unknown, isCurrent: () => boolean) {
    const snapshot = verifyVideoAck(preview, binding, event, response);
    if (!snapshot) return Promise.resolve(false);
    return this.acknowledge("progress", binding, event, isCurrent,
      stored => !!verifyVideoAck(preview, binding, stored, response),
      { videoId: preview.post.body.videoId, snapshot });
  }

  /** Snapshot reads/writes never cross a verified owner or epoch. */
  async videoSnapshot(videoId: string, binding: V2SessionBinding,
    snapshot?: VideoProgressSnapshot, isCurrent: () => boolean = () => true): Promise<VideoProgressSnapshot | null> {
    if (!validVideoId(videoId) || (snapshot && !validVideoSnapshot(snapshot))) return null;
    const version = this.generation;
    const current = () => isCurrent() && this.unchanged(version, binding);
    return this.serial(async () => {
      const attest = async () => {
        if (!current()) return false;
        const raw = await this.deps.secure.getItemAsync(BINDING_KEY);
        let stored: unknown;
        try { stored = raw ? JSON.parse(raw) : null; } catch { return false; }
        return current() && validBinding(stored) &&
          stored.principalId === binding.principalId && stored.authEpoch === binding.authEpoch;
      };
      if (!await attest()) return null;
      const key = keyFor("progress", binding);
      const raw = await this.deps.storage.getItem(key);
      if (!await attest()) return null;
      const envelope: V2Envelope = raw === null ? { ...binding, entries: [] } : parseEnvelope(raw, binding, "progress");
      if (snapshot) {
        // Never change the baseline of a pending immutable command.
        if (envelope.entries.some(event => event.kind === "saveVideoProgress" && event.payload.videoId === videoId))
          return null;
        await this.deps.storage.setItem(key, JSON.stringify(withVideoSnapshot(envelope, videoId, snapshot)));
        return current() ? snapshot : null;
      }
      const saved = envelope.videoSnapshots;
      return saved && Object.hasOwn(saved, videoId) ? { ...saved[videoId] } : null;
    });
  }

  private async acknowledge(
    queue: NewOnlyV2QueueKind, binding: V2SessionBinding, event: V2PendingEvent,
    isCurrent: () => boolean, verified: (stored: V2PendingEvent) => boolean,
    video?: { videoId: string; snapshot: VideoProgressSnapshot },
  ): Promise<boolean> {
    const version = this.generation;
    const current = () => isCurrent() && this.unchanged(version, binding);
    if (!current()) return false;
    return this.serial(async () => {
      if (!current()) return false;
      const attest = async () => {
        const raw = await this.deps.secure.getItemAsync(BINDING_KEY);
        let stored: unknown;
        try { stored = raw ? JSON.parse(raw) : null; } catch { return false; }
        return current() && validBinding(stored) &&
          stored.principalId === binding.principalId && stored.authEpoch === binding.authEpoch;
      };
      if (!await attest()) return false;
      const key = keyFor(queue, binding);
      const raw = await this.deps.storage.getItem(key);
      if (!current() || raw === null) return false;
      const envelope = parseEnvelope(raw, binding, queue);
      const stored = envelope.entries.find(row => row.eventId === event.eventId);
      if (!stored || stored.createdAt !== event.createdAt || stored.kind !== event.kind ||
          JSON.stringify(stored.payload) !== JSON.stringify(event.payload)) return false;
      // Never reorder progress past an older command in the same queue.
      if (queue === "progress" && envelope.entries[0]?.eventId !== event.eventId) return false;
      if (!verified(stored) || !await attest()) return false;
      await this.deps.storage.setItem(key, JSON.stringify({
        ...(video ? withVideoSnapshot(envelope, video.videoId, video.snapshot) : envelope),
        entries: envelope.entries.filter(row => row.eventId !== event.eventId),
      }));
      if (!current()) return false;
      const receipts = queue === "prevention" ? this.preventionAcknowledgements : this.practiceAcknowledgements;
      receipts.add(event.eventId);
      if (receipts.size > 1000) {
        const oldest = receipts.values().next().value;
        if (oldest !== undefined) receipts.delete(oldest);
      }
      for (const listener of queue === "prevention" ? this.preventionListeners : this.practiceListeners) {
        // A presentation subscriber cannot turn a committed deletion into a failed ACK.
        try { listener(); } catch { /* The durable acknowledgement remains valid. */ }
      }
      return true;
    });
  }

  /** Fully durable enqueue. The writer itself never sends or removes events. */
  async enqueue(
    queue: NewOnlyV2QueueKind,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<V2PendingEvent & { ownerId: string; authEpoch: string }> {
    const binding = this.active;
    const version = this.generation;
    if (!binding) throw new NewOnlyV2Error("V2_SESSION_UNVERIFIED");
    if (!KINDS[queue].has(kind)) throw new NewOnlyV2Error("V2_INVALID_PAYLOAD");
    let immutablePayload = clonePayload(payload);
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
      if (queue === "progress") {
        const { offlineProgressVersion, ...clean } = immutablePayload;
        const resource = stepJournalResource(clean);
        if (resource) {
          const previous = [...envelope.entries].reverse().find(event => stepJournalResource(event.payload) === resource);
          if (previous) {
            delete clean.expectedVersion;
            clean.previousEventId = previous.eventId;
          } else if (kind === "saveVideoProgress" && validVideoId(clean.videoId) &&
            envelope.videoSnapshots && Object.hasOwn(envelope.videoSnapshots, clean.videoId)) {
            clean.expectedVersion = envelope.videoSnapshots[clean.videoId].progressVersion;
          } else if (validProgressVersion(offlineProgressVersion)) {
            clean.expectedVersion = offlineProgressVersion;
          }
        }
        immutablePayload = clean;
      }
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
          ...envelope,
          entries: [...envelope.entries, entry],
        }),
      );
      if (!this.unchanged(version, binding)) throw new NewOnlyV2Error("V2_SESSION_CHANGED");
      for (const listener of this.pendingListeners) {
        // Observers may schedule work, but cannot invalidate a durable write.
        try { listener(); } catch { /* keep the stored entry */ }
      }
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

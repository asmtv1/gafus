/** AG4 source/mock grant ONLY. No actual browser/IndexedDB/localStorage
 * provider; storage is injected fake async CAS for targeted owner tests.
 * Never persists user id, payload, token, name or clinical information.
 */
import { reminderV2Key } from "./reminderV2SourceCandidate";

export const REMINDER_V2_DURABLE_MOCK = "AG2_REMINDER_V2_ASYNC_CAS_SOURCE_MOCK_ONLY" as const;
export type DurablePhase =
  | "PREPARED"
  | "MAY_HAVE_SENT"
  | "UNKNOWN"
  | "COMMITTED"
  | "SERVER_COMMITTED_UNVERIFIED_DRAFT"
  | "REJECTED";
export type DurableMarker = {
  readonly schemaVersion: 1;
  readonly ownerScope: string;
  readonly authEpoch: string;
  readonly operationKey: string;
  readonly phase: DurablePhase;
  readonly createdAt: number;
  readonly lastSeenAt: number;
};
export type DurableCASStore = {
  read(): Promise<unknown>;
  compareAndSwap(expected: DurableMarker | null, next: DurableMarker): Promise<boolean>;
};
export type DurableRead =
  | { kind: "empty" }
  | { kind: "owned"; marker: DurableMarker }
  | { kind: "quarantined" }
  | { kind: "fault" };
export type DurableMockController = {
  fixtureKind: typeof REMINDER_V2_DURABLE_MOCK;
  read(): Promise<DurableRead>;
  reserve(key: string): Promise<DurableMarker | null>;
  beforeSend(prepared: DurableMarker): Promise<DurableMarker | null>;
  mark(
    previous: DurableMarker,
    phase: "UNKNOWN" | "COMMITTED" | "SERVER_COMMITTED_UNVERIFIED_DRAFT" | "REJECTED",
  ): Promise<DurableMarker | null>;
};

/** These are injected TEST-ONLY pseudonymous handles, NOT proof of
 * authentication. UI must additionally verify the active QueryClient user.
 */
const scopeOk = (s: string) => /^psn_[A-Za-z0-9_-]{20,100}$/.test(s);
const epochOk = (s: string) => /^epoch_[A-Za-z0-9_-]{8,100}$/.test(s);
const phases = [
  "PREPARED",
  "MAY_HAVE_SENT",
  "UNKNOWN",
  "COMMITTED",
  "SERVER_COMMITTED_UNVERIFIED_DRAFT",
  "REJECTED",
];
const lifetime = 30 * 24 * 60 * 60 * 1000;
function parse(input: unknown, now: number): DurableMarker | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  if (
    Object.keys(d).sort().join(",") !==
    ["schemaVersion", "ownerScope", "authEpoch", "operationKey", "phase", "createdAt", "lastSeenAt"]
      .sort()
      .join(",")
  )
    return null;
  if (
    d.schemaVersion !== 1 ||
    typeof d.ownerScope !== "string" ||
    !scopeOk(d.ownerScope) ||
    typeof d.authEpoch !== "string" ||
    !epochOk(d.authEpoch) ||
    typeof d.operationKey !== "string" ||
    !phases.includes(String(d.phase)) ||
    !Number.isSafeInteger(d.createdAt) ||
    !Number.isSafeInteger(d.lastSeenAt) ||
    Number(d.createdAt) > now + 60_000 ||
    Number(d.lastSeenAt) > now + 60_000 ||
    Number(d.createdAt) < 0 ||
    Number(d.lastSeenAt) < Number(d.createdAt)
  )
    return null;
  try {
    reminderV2Key(d.operationKey);
  } catch {
    return null;
  }
  // An expired receipt is never evidence that a POST did not happen.
  // Treat its marker as an opaque quarantine, NOT an empty slot.
  return Object.freeze({
    schemaVersion: 1,
    ownerScope: d.ownerScope,
    authEpoch: d.authEpoch,
    operationKey: d.operationKey,
    phase: d.phase as DurablePhase,
    createdAt: d.createdAt as number,
    lastSeenAt: d.lastSeenAt as number,
  });
}
export function makeReminderV2DurableMock({
  store,
  ownerScope,
  authEpoch,
  now = () => Date.now(),
}: {
  store: DurableCASStore;
  ownerScope: string;
  authEpoch: string;
  now?: () => number;
}): DurableMockController {
  const valid =
    scopeOk(ownerScope) &&
    epochOk(authEpoch) &&
    typeof store?.read === "function" &&
    typeof store.compareAndSwap === "function";
  const read = async (): Promise<DurableRead> => {
    if (!valid) return { kind: "fault" };
    try {
      const value = await store.read();
      if (value === null) return { kind: "empty" };
      const marker = parse(value, now());
      if (!marker) return { kind: "fault" };
      if (
        marker.ownerScope !== ownerScope ||
        marker.authEpoch !== authEpoch ||
        now() - marker.createdAt > lifetime
      )
        return { kind: "quarantined" };
      return { kind: "owned", marker };
    } catch {
      return { kind: "fault" };
    }
  };
  const transition = async (
    old: DurableMarker,
    phase: DurablePhase,
  ): Promise<DurableMarker | null> => {
    const state = await read();
    if (state.kind !== "owned" || JSON.stringify(state.marker) !== JSON.stringify(old)) return null;
    const next = Object.freeze({ ...old, phase, lastSeenAt: now() });
    try {
      if (await store.compareAndSwap(old, next)) {
        const confirm = await read();
        if (confirm.kind === "owned" && JSON.stringify(confirm.marker) === JSON.stringify(next))
          return next;
      }
    } catch {
      /* guarded: unknown, no optimistic state */
    }
    return null;
  };
  return {
    fixtureKind: REMINDER_V2_DURABLE_MOCK,
    read,
    async reserve(key) {
      if (!valid) return null;
      let uuid: string;
      try {
        uuid = reminderV2Key(key);
      } catch {
        return null;
      }
      if ((await read()).kind !== "empty") return null;
      const t = now();
      const entry: DurableMarker = Object.freeze({
        schemaVersion: 1,
        ownerScope,
        authEpoch,
        operationKey: uuid,
        phase: "PREPARED",
        createdAt: t,
        lastSeenAt: t,
      });
      try {
        if (await store.compareAndSwap(null, entry)) {
          const state = await read();
          if (state.kind === "owned" && JSON.stringify(state.marker) === JSON.stringify(entry))
            return entry;
        }
      } catch {
        /* write/read failure blocks POST */
      }
      return null;
    },
    async beforeSend(marker) {
      if (marker.phase !== "PREPARED") return null;
      return transition(marker, "MAY_HAVE_SENT");
    },
    async mark(marker, phase) {
      // A restored PREPARED is UNKNOWN, not a POST replay grant. An
      // explicit owner-scoped readback may nevertheless discover a
      // previously committed receipt and update this marker safely.
      if (!["PREPARED", "MAY_HAVE_SENT", "UNKNOWN"].includes(marker.phase)) return null;
      if (marker.phase === "PREPARED" && phase === "REJECTED") return null;
      // No draft survives a cold restart; terminal owner-key receipt is
      // different from an in-memory create ACK. Exact confirmation requires
      // an independently proven draft+list ID (not part of this mock).
      if (
        phase === "SERVER_COMMITTED_UNVERIFIED_DRAFT" &&
        !["PREPARED", "MAY_HAVE_SENT", "UNKNOWN"].includes(marker.phase)
      )
        return null;
      return transition(marker, phase);
    },
  };
}
/** Test-only, shared across re-instantiated controllers and independent
 * React roots. Async CAS executes atomically without scheduling between
 * compare and assignment; NEVER used as production storage provider.
 */
export function makeReminderV2FakeAsyncCAS(initial: unknown = null): DurableCASStore {
  let current: unknown = initial;
  return {
    async read() {
      return structuredClone(current);
    },
    async compareAndSwap(expected, next) {
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      current = structuredClone(next);
      return true;
    },
  };
}

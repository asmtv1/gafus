/** AG3 V49 durable Reminder intent review, mock storage ONLY.
 * No SecureStore, AsyncStorage, legacy namespaces, real HTTP or background replay.
 * AG4 Reminder-specific durable storage and cross-epoch resolution remain gated. */
import type { Reminder, ReminderPayload } from "@/shared/lib/api/reminders";
import type { PushActor } from "@/shared/lib/utils/pushRegistrationOwner";
import type { ApiResponse } from "@/shared/lib/api/client";
import { reportClientError } from "@/shared/lib/tracer";
import {
  createReminderV2ReviewCandidate,
  type ImmutableReminderV2Post,
  type ImmutableReminderV2Get,
  type Receipt,
  type CandidateOutcome,
} from "./reminderV2Candidate";

export const DURABLE_STATUSES = [
  "UNKNOWN",
  "REJECTED_CAP",
  "TERMINAL_CONFLICT",
  "TERMINAL_INVALID",
  "CONFIRMED",
] as const;
export type ReminderV49Status = (typeof DURABLE_STATUSES)[number];
export type ReminderV49Record = Readonly<{
  ownerId: string;
  authEpoch: string;
  idempotencyKey: string;
  status: ReminderV49Status;
}>;

/** These three functions are injected, with NO concrete storage implementation.
 * reserve MUST be atomic create-if-empty. transition MUST be atomic CAS for
 * exact old record. Both must survive process termination if ever authorized.
 * Neither is implemented for an actual device in V49. */
export interface ReminderV49MockStore {
  load: () => Promise<unknown | null>;
  reserve: (next: ReminderV49Record) => Promise<boolean>;
  transition: (expected: ReminderV49Record, next: ReminderV49Record) => Promise<boolean>;
}
export interface ReminderV49MockDependencies {
  store: ReminderV49MockStore;
  uuidV4: () => string;
  postMock: (request: ImmutableReminderV2Post) => Promise<ApiResponse<Reminder>>;
  lookupMock?: (request: ImmutableReminderV2Get) => Promise<ApiResponse<Receipt>>;
}
export type ReminderV49Phase =
  | "unchecked"
  | "ready"
  | "unknown"
  | "confirmed"
  | "rejected_cap"
  | "terminal_conflict"
  | "terminal_invalid"
  | "quarantined"
  | "blocked";
export type ReminderV49Outcome = CandidateOutcome | { kind: "quarantined" };
const UUID4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const keys = ["authEpoch", "idempotencyKey", "ownerId", "status"].sort();
function parseRecord(raw: unknown): ReminderV49Record | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join("|") !== keys.join("|")) return null;
  if (
    typeof value.ownerId !== "string" ||
    !value.ownerId ||
    typeof value.authEpoch !== "string" ||
    !value.authEpoch ||
    typeof value.idempotencyKey !== "string" ||
    !UUID4.test(value.idempotencyKey) ||
    !DURABLE_STATUSES.includes(value.status as ReminderV49Status)
  )
    return null;
  return Object.freeze({
    ownerId: value.ownerId,
    authEpoch: value.authEpoch,
    idempotencyKey: value.idempotencyKey.toLowerCase(),
    status: value.status as ReminderV49Status,
  });
}
function exact(a: ReminderV49Record | null, b: ReminderV49Record | null): boolean {
  return (
    !!a &&
    !!b &&
    a.ownerId === b.ownerId &&
    a.authEpoch === b.authEpoch &&
    a.idempotencyKey === b.idempotencyKey &&
    a.status === b.status
  );
}
function fromStatus(status: ReminderV49Status): ReminderV49Phase {
  switch (status) {
    case "UNKNOWN":
      return "unknown";
    case "REJECTED_CAP":
      return "rejected_cap";
    case "TERMINAL_CONFLICT":
      return "terminal_conflict";
    case "TERMINAL_INVALID":
      return "terminal_invalid";
    case "CONFIRMED":
      return "confirmed";
  }
}
/** Standalone injected candidate prepared for AG4 review; ordinary screen is untouched. */
export function createReminderV49DurableReview(deps: ReminderV49MockDependencies) {
  let phase: ReminderV49Phase = "unchecked";
  let record: ReminderV49Record | null = null;
  let actorPin: PushActor | null = null;
  let checkBusy = false;
  let createBusy = false;
  let lookupBusy = false;
  let storeFailed = false;
  let inner: ReturnType<typeof createReminderV2ReviewCandidate> | null = null;
  const authorized = (actor: PushActor, current: () => boolean) =>
    current() &&
    !!actorPin &&
    actor.ownerId === actorPin.ownerId &&
    actor.authEpoch === actorPin.authEpoch;
  const guard = (actor: PushActor, current: () => boolean) =>
    authorized(actor, current) && !storeFailed;
  const fail = (): ReminderV49Outcome => {
    phase = "blocked";
    storeFailed = true;
    return { kind: "blocked" };
  };
  const persist = async (nextStatus: ReminderV49Status): Promise<boolean> => {
    if (!record || storeFailed) return false;
    const next = Object.freeze({ ...record, status: nextStatus });
    try {
      if (!(await deps.store.transition(record, next))) return false;
      const verified = parseRecord(await deps.store.load());
      if (!exact(verified, next)) return false;
      record = next;
      phase = fromStatus(nextStatus);
      return true;
    } catch {
      reportClientError(new Error("REMINDER_V49_STORAGE_TRANSITION_UNKNOWN"), {
        issueKey: "ReminderV49Review",
        keys: { operation: "status_transition" },
      });
      return false;
    }
  };
  const setStatus = async (status: ReminderV49Status): Promise<boolean> => {
    const succeeded = await persist(status);
    if (!succeeded) fail();
    return succeeded;
  };
  return {
    phase: () => phase,
    /** Must complete before any attempt; failed/corrupt/mismatched reads fail closed. */
    async restore(actor: PushActor, current: () => boolean): Promise<ReminderV49Phase> {
      if (phase !== "unchecked" || checkBusy || createBusy) return "blocked";
      if (!current() || !actor.ownerId || !actor.authEpoch) return "blocked";
      checkBusy = true;
      const pinned = Object.freeze({ ...actor });
      actorPin = pinned;
      try {
        const raw = await deps.store.load();
        if (!current()) return (phase = "quarantined");
        if (raw === null) {
          record = null;
          return (phase = "ready");
        }
        const verified = parseRecord(raw);
        if (!verified) return (phase = "blocked");
        record = verified;
        if (verified.ownerId !== actor.ownerId || verified.authEpoch !== actor.authEpoch)
          return (phase = "quarantined");
        return (phase = fromStatus(verified.status));
      } catch {
        reportClientError(new Error("REMINDER_V49_STORAGE_RESTORE_UNKNOWN"), {
          issueKey: "ReminderV49Review",
          keys: { operation: "restore" },
        });
        return (phase = "blocked");
      } finally {
        checkBusy = false;
      }
    },
    /** First POST is permitted only from explicitly restored empty mock store.
     * Wrapper writes and independently READS minimal UNKNOWN before any POST bytes. */
    async create(
      actor: PushActor,
      payload: ReminderPayload,
      current: () => boolean,
    ): Promise<ReminderV49Outcome> {
      if (!guard(actor, current)) return { kind: "stale" };
      if (phase !== "ready" || checkBusy || createBusy || record) return { kind: "blocked" };
      createBusy = true;
      let reservationFault = false;
      const candidate = createReminderV2ReviewCandidate({
        uuidV4: deps.uuidV4,
        post: async (request) => {
          if (!guard(actor, current)) throw new Error("V49_NOT_CURRENT");
          const next: ReminderV49Record = Object.freeze({
            ownerId: actor.ownerId,
            authEpoch: actor.authEpoch,
            idempotencyKey: request.headers["Idempotency-Key"],
            status: "UNKNOWN",
          });
          try {
            // Atomic reserve prevents competing sessions/processes from launching POST.
            if (!(await deps.store.reserve(next))) throw new Error("V49_RESERVATION_DENIED");
            const persisted = parseRecord(await deps.store.load());
            if (!exact(persisted, next)) throw new Error("V49_NOT_DURABLE");
            record = next;
            phase = "unknown";
          } catch {
            reportClientError(new Error("REMINDER_V49_STORAGE_RESERVE_UNKNOWN"), {
              issueKey: "ReminderV49Review",
              keys: { operation: "prepost_reserve" },
            });
            reservationFault = true;
            throw new Error("V49_STORAGE_FAIL_CLOSED");
          }
          if (!guard(actor, current)) throw new Error("V49_STALE_BEFORE_POST");
          return deps.postMock(request);
        },
        ...(deps.lookupMock ? { ownerLookupMock: deps.lookupMock } : {}),
      });
      inner = candidate;
      try {
        const outcome = await candidate.create(actor, payload, () => guard(actor, current));
        if (reservationFault) return fail();
        if (!guard(actor, current)) return { kind: "stale" };
        if (outcome.kind === "acknowledged") return outcome; // UNKNOWN kept on disk until list proof.
        if (outcome.kind === "rejected") {
          if (!(await setStatus("REJECTED_CAP"))) return { kind: "blocked" };
          if (!guard(actor, current)) return { kind: "stale" };
          return outcome;
        }
        if (outcome.kind === "terminal") {
          const status =
            outcome.code === "REMINDER_IDEMPOTENCY_CONFLICT"
              ? "TERMINAL_CONFLICT"
              : "TERMINAL_INVALID";
          if (!(await setStatus(status))) return { kind: "blocked" };
          if (!guard(actor, current)) return { kind: "stale" };
          return outcome;
        }
        if (outcome.kind === "blocked" && record === null) {
          inner = null;
          return outcome; // bad local form/key; no write and no durable record
        }
        return outcome;
      } finally {
        createBusy = false;
      }
    },
    /** Verified current-process ACK and exact-id list readback; durable transition
     * must commit and roundtrip before exposing CONFIRMED. */
    async confirmList(
      actor: PushActor,
      rows: readonly Reminder[],
      current: () => boolean,
    ): Promise<ReminderV49Outcome> {
      if (!guard(actor, current)) return { kind: "stale" };
      if (!inner || phase !== "unknown") return { kind: "blocked" };
      const result = inner.confirmList(actor, rows, () => guard(actor, current));
      if (result.kind !== "confirmed") return result;
      if (!(await setStatus("CONFIRMED"))) return { kind: "blocked" };
      if (!guard(actor, current)) return { kind: "stale" };
      return result;
    },
    /** Restored intents have NO original payload. Consequently even a valid 200
     * receipt cannot prove exact old payload without separately approved AG4 trust.
     * GET 404/expired/foreign are always UNKNOWN, never new POST permission. */
    async manualLookup(actor: PushActor, current: () => boolean): Promise<ReminderV49Outcome> {
      if (!guard(actor, current)) return { kind: "stale" };
      if (phase !== "unknown" || !record || lookupBusy) return { kind: "blocked" };
      if (!deps.lookupMock) return { kind: "gated" };
      lookupBusy = true;
      const scoped = () => guard(actor, current);
      const request = Object.freeze({
        method: "GET" as const,
        path: `/api/v1/reminders/operations/${encodeURIComponent(record.idempotencyKey)}`,
        requestGuard: scoped,
      });
      try {
        if (!scoped()) return { kind: "stale" };
        const result = await deps.lookupMock(request);
        if (!scoped()) return { kind: "stale" };
        if (
          !result.success ||
          result.code ||
          result.data?.status !== "COMMITTED" ||
          !result.data.reminder?.id
        )
          return { kind: "unknown" };
        // Source/mock has no AG4 permission to trust a restored payload-less 200.
        return { kind: "gated" };
      } catch {
        reportClientError(new Error("REMINDER_V49_OWNER_LOOKUP_UNKNOWN"), {
          issueKey: "ReminderV49Review",
          keys: { operation: "manual_lookup" },
        });
        return { kind: "unknown" };
      } finally {
        lookupBusy = false;
      }
    },
  };
}

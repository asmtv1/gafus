/** AG3/AG4 V49 SOURCE-MOCK ONLY: isolated journal and injected transport.
 * No real native storage, HTTP, offline replay, migration or ordinary screen activation.
 * Supersedes raw ownerId V49 review journal shape for this narrowly granted test. */
import type { ApiResponse } from "@/shared/lib/api/client";
import type { Reminder, ReminderPayload } from "@/shared/lib/api/reminders";
import type { PushActor } from "@/shared/lib/utils/pushRegistrationOwner";
import { reportClientError } from "@/shared/lib/tracer";
import {
  createReminderV2ReviewCandidate,
  type ImmutableReminderV2Post,
  type ImmutableReminderV2Get,
  type Receipt,
  type CandidateOutcome,
} from "./reminderV2Candidate";

/** v2 adds the separate server owner-key proof WITHOUT a draft-equality assertion. */
export type V49AG4Phase =
  | "PREPARED"
  | "MAY_HAVE_SENT"
  | "UNKNOWN"
  | "COMMITTED"
  | "REJECTED"
  | "SERVER_COMMITTED_UNVERIFIED_DRAFT";
export type V49AG4Outcome =
  | CandidateOutcome
  | {
      kind: "server_committed_unverified_draft";
      reminder: Reminder; // ephemeral trusted server result, NEVER persisted
    };
export type V49AG4Record = Readonly<{
  schemaVersion: 2;
  ownerScopeHandle: string; // injected per-install derived pseudonym; NEVER raw ownerId
  authEpoch: string;
  idempotencyKey: string;
  phase: V49AG4Phase;
  createdAt: number;
  lastSeenAt: number;
}>;
export interface V49AG4MockStore {
  load: () => Promise<unknown | null>;
  reserve: (record: V49AG4Record) => Promise<boolean>;
  cas: (expected: V49AG4Record, next: V49AG4Record) => Promise<boolean>;
}
export interface V49AG4MockTransport {
  store: V49AG4MockStore;
  /** Testing boundary: must derive pseudonymous handle outside this module. */
  scopeHandle: (actor: PushActor) => string;
  clock: () => number;
  uuidV4: () => string;
  postMock: (request: ImmutableReminderV2Post) => Promise<ApiResponse<Reminder>>;
  lookupMock?: (request: ImmutableReminderV2Get) => Promise<ApiResponse<Receipt>>;
}
type ViewState =
  | "unchecked"
  | "idle"
  | "unknown"
  | "terminal"
  | "server_committed_unverified_draft"
  | "blocked"
  | "quarantined";
const statuses = [
  "PREPARED",
  "MAY_HAVE_SENT",
  "UNKNOWN",
  "COMMITTED",
  "REJECTED",
  "SERVER_COMMITTED_UNVERIFIED_DRAFT",
] as const;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const handle = /^h_[a-f0-9]{32,64}$/;
const keys = [
  "authEpoch",
  "createdAt",
  "idempotencyKey",
  "lastSeenAt",
  "ownerScopeHandle",
  "phase",
  "schemaVersion",
].join("|");
function parse(value: unknown): V49AG4Record | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join("|") !== keys ||
    v.schemaVersion !== 2 ||
    typeof v.ownerScopeHandle !== "string" ||
    !handle.test(v.ownerScopeHandle) ||
    typeof v.authEpoch !== "string" ||
    !v.authEpoch ||
    typeof v.idempotencyKey !== "string" ||
    !uuid.test(v.idempotencyKey) ||
    !statuses.includes(v.phase as V49AG4Phase) ||
    typeof v.createdAt !== "number" ||
    !Number.isSafeInteger(v.createdAt) ||
    v.createdAt < 0 ||
    typeof v.lastSeenAt !== "number" ||
    !Number.isSafeInteger(v.lastSeenAt) ||
    v.lastSeenAt < v.createdAt
  )
    return null;
  return Object.freeze({
    schemaVersion: 2,
    ownerScopeHandle: v.ownerScopeHandle,
    authEpoch: v.authEpoch,
    idempotencyKey: v.idempotencyKey.toLowerCase(),
    phase: v.phase as V49AG4Phase,
    createdAt: v.createdAt,
    lastSeenAt: v.lastSeenAt,
  });
}
const same = (a: V49AG4Record | null, b: V49AG4Record) =>
  !!a &&
  a.schemaVersion === b.schemaVersion &&
  a.ownerScopeHandle === b.ownerScopeHandle &&
  a.authEpoch === b.authEpoch &&
  a.idempotencyKey === b.idempotencyKey &&
  a.phase === b.phase &&
  a.createdAt === b.createdAt &&
  a.lastSeenAt === b.lastSeenAt;
export function createReminderV49AG4Review(deps: V49AG4MockTransport) {
  let view: ViewState = "unchecked";
  let record: V49AG4Record | null = null;
  let owner: PushActor | null = null;
  let ownerHandle: string | null = null;
  let busy = false,
    restoring = false,
    lookupBusy = false;
  let active: ReturnType<typeof createReminderV2ReviewCandidate> | null = null;
  const current = (actor: PushActor, live: () => boolean) =>
    live() &&
    !!owner &&
    actor.ownerId === owner.ownerId &&
    actor.authEpoch === owner.authEpoch &&
    !!ownerHandle &&
    record?.ownerScopeHandle !== undefined &&
    record.ownerScopeHandle === ownerHandle;
  // Guard for PRE-reserve stage when record is null.
  const ownerLive = (actor: PushActor, live: () => boolean) =>
    live() &&
    !!owner &&
    actor.ownerId === owner.ownerId &&
    actor.authEpoch === owner.authEpoch &&
    !!ownerHandle;
  const lock = () => {
    view = "blocked";
    return false;
  };
  async function cas(phase: V49AG4Phase): Promise<boolean> {
    if (!record) return lock();
    const timestamp = deps.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < record.lastSeenAt) return lock();
    const next = Object.freeze({ ...record, phase, lastSeenAt: timestamp });
    try {
      if (!(await deps.store.cas(record, next))) return lock();
      const check = parse(await deps.store.load());
      if (!same(check, next)) return lock();
      record = next;
      return true;
    } catch {
      reportClientError(new Error("REMINDER_V49_AG4_CAS_UNKNOWN"), {
        issueKey: "ReminderV49AG4Review",
        keys: { operation: "cas_readback" },
      });
      return lock();
    }
  }
  return {
    /** idle is available only after verified mock load of an EMPTY namespace. */
    state: () => view,
    phase: () => record?.phase ?? null,
    async restore(actor: PushActor, live: () => boolean): Promise<ViewState> {
      if (view !== "unchecked" || restoring || busy) return "blocked";
      if (!live() || !actor.ownerId || !actor.authEpoch) return (view = "blocked");
      restoring = true;
      owner = Object.freeze({ ...actor });
      try {
        const scope = deps.scopeHandle(actor);
        if (!handle.test(scope)) return (view = "blocked");
        ownerHandle = scope;
        const raw = await deps.store.load();
        if (!ownerLive(actor, live)) return (view = "quarantined");
        if (raw === null) return (view = "idle");
        const loaded = parse(raw);
        if (!loaded) return (view = "blocked");
        record = loaded;
        if (loaded.ownerScopeHandle !== scope || loaded.authEpoch !== actor.authEpoch)
          return (view = "quarantined");
        // Crash at PREPARED or MAY_HAVE_SENT is ALWAYS uncertain; NO replay.
        view =
          loaded.phase === "SERVER_COMMITTED_UNVERIFIED_DRAFT"
            ? "server_committed_unverified_draft"
            : loaded.phase === "COMMITTED" || loaded.phase === "REJECTED"
              ? "terminal"
              : "unknown";
        return view;
      } catch {
        reportClientError(new Error("REMINDER_V49_AG4_RESTORE_UNKNOWN"), {
          issueKey: "ReminderV49AG4Review",
          keys: { operation: "restore" },
        });
        return (view = "blocked");
      } finally {
        restoring = false;
      }
    },
    async create(
      actor: PushActor,
      payload: ReminderPayload,
      live: () => boolean,
    ): Promise<CandidateOutcome> {
      if (!ownerLive(actor, live)) return { kind: "stale" };
      if (view !== "idle" || busy || record || restoring) return { kind: "blocked" };
      busy = true;
      let storageFault = false;
      const core = createReminderV2ReviewCandidate({
        uuidV4: deps.uuidV4,
        post: async (request) => {
          if (!ownerLive(actor, live)) throw new Error("V49_STALE_PRE_RESERVE");
          const time = deps.clock();
          if (!Number.isSafeInteger(time) || time < 0) throw new Error("V49_INVALID_CLOCK");
          const initial = Object.freeze({
            schemaVersion: 2 as const,
            ownerScopeHandle: ownerHandle!,
            authEpoch: actor.authEpoch,
            idempotencyKey: request.headers["Idempotency-Key"],
            phase: "PREPARED" as const,
            createdAt: time,
            lastSeenAt: time,
          });
          try {
            if (!(await deps.store.reserve(initial))) throw new Error("V49_RESERVE_CAS_DENIED");
            if (!same(parse(await deps.store.load()), initial))
              throw new Error("V49_RESERVE_VERIFY_FAILED");
            record = initial;
            if (!(await cas("MAY_HAVE_SENT"))) throw new Error("V49_MAY_HAVE_SENT_FAILED");
          } catch {
            reportClientError(new Error("REMINDER_V49_AG4_PREPOST_UNKNOWN"), {
              issueKey: "ReminderV49AG4Review",
              keys: { operation: "prepost_durability" },
            });
            storageFault = true;
            view = "blocked";
            throw new Error("V49_FAIL_CLOSED");
          }
          if (!ownerLive(actor, live)) throw new Error("V49_STALE_PRE_POST");
          view = "unknown";
          return deps.postMock(request);
        },
      });
      active = core;
      try {
        const outcome = await core.create(
          actor,
          payload,
          () => ownerLive(actor, live) && view !== "blocked",
        );
        if (storageFault) return { kind: "blocked" };
        if (!ownerLive(actor, live)) return { kind: "stale" };
        if (outcome.kind === "acknowledged") return outcome;
        if (outcome.kind === "rejected" || outcome.kind === "terminal") {
          if (!(await cas("REJECTED"))) return { kind: "blocked" };
          if (!ownerLive(actor, live)) return { kind: "stale" };
          view = "terminal";
          return outcome;
        }
        if (outcome.kind === "blocked" && !record) {
          active = null;
          view = "idle";
          return outcome;
        }
        if (record) {
          if (!(await cas("UNKNOWN"))) return { kind: "blocked" };
          view = "unknown";
        }
        return outcome;
      } finally {
        busy = false;
      }
    },
    async confirmList(
      actor: PushActor,
      rows: readonly Reminder[],
      live: () => boolean,
    ): Promise<CandidateOutcome> {
      if (!ownerLive(actor, live)) return { kind: "stale" };
      if (!active || view !== "unknown") return { kind: "blocked" };
      const proof = active.confirmList(actor, rows, () => ownerLive(actor, live));
      if (proof.kind !== "confirmed") return proof;
      if (!(await cas("COMMITTED"))) return { kind: "blocked" };
      if (!ownerLive(actor, live)) return { kind: "stale" };
      view = "terminal";
      return proof;
    },
    markReadbackUnknown(actor: PushActor, live: () => boolean): CandidateOutcome {
      if (!ownerLive(actor, live)) return { kind: "stale" };
      if (view !== "blocked") view = "unknown";
      return { kind: "unknown" };
    },
    async manualLookup(actor: PushActor, live: () => boolean): Promise<V49AG4Outcome> {
      if (!ownerLive(actor, live)) return { kind: "stale" };
      if (!current(actor, live) || view !== "unknown" || !record || lookupBusy)
        return { kind: "blocked" };
      if (!deps.lookupMock) return { kind: "gated" };
      lookupBusy = true;
      const check = () => ownerLive(actor, live) && record?.ownerScopeHandle === ownerHandle;
      const request = Object.freeze({
        method: "GET" as const,
        path: `/api/v1/reminders/operations/${encodeURIComponent(record.idempotencyKey)}`,
        requestGuard: check,
      });
      try {
        if (!check()) return { kind: "stale" };
        const reply = await deps.lookupMock(request);
        if (!check()) return { kind: "stale" };
        if (
          !reply.success ||
          reply.code ||
          reply.data?.status !== "COMMITTED" ||
          typeof reply.data.reminder?.id !== "string" ||
          !reply.data.reminder.id
        )
          return { kind: "unknown" };
        // AG4 v2 policy: authenticated owner+key receipt is authoritative that
        // the server created a Reminder, NOT proof of original input equality.
        // Never store DTO, draft, fingerprint, response, or names in this journal.
        if (!(await cas("SERVER_COMMITTED_UNVERIFIED_DRAFT"))) return { kind: "blocked" };
        if (!check()) return { kind: "stale" };
        view = "server_committed_unverified_draft";
        return { kind: "server_committed_unverified_draft", reminder: reply.data.reminder };
      } catch {
        reportClientError(new Error("REMINDER_V49_AG4_LOOKUP_UNKNOWN"), {
          issueKey: "ReminderV49AG4Review",
          keys: { operation: "manual_lookup" },
        });
        return { kind: "unknown" };
      } finally {
        lookupBusy = false;
      }
    },
  };
}
export type ReminderV49AG4Review = ReturnType<typeof createReminderV49AG4Review>;

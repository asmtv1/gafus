/** AG3 V48 — REVIEW-ONLY Reminder V2 candidate, no network or SDK imports.
 * AG4 approves source/mock consumers, NOT activation against packaged Core.
 * The ordinary `remindersApi.create` remains unchanged and keyless. */
import type { ApiResponse } from "@/shared/lib/api/client";
import type { Reminder, ReminderPayload } from "@/shared/lib/api/reminders";
import type { PushActor } from "@/shared/lib/utils/pushRegistrationOwner";
import { reportClientError } from "@/shared/lib/tracer";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = /^[1-7](,[1-7])*$/;
export type ImmutableReminderV2Post = Readonly<{
  method: "POST";
  path: "/api/v1/reminders";
  headers: Readonly<{ "Idempotency-Key": string }>;
  body: Readonly<ReminderPayload>;
  requestGuard: () => boolean;
}>;
export type ImmutableReminderV2Get = Readonly<{
  method: "GET";
  path: string;
  requestGuard: () => boolean;
}>;
export type Receipt = Readonly<{ status: "COMMITTED"; reminder: Reminder }>;
export type CandidateOutcome =
  | { kind: "acknowledged"; reminder: Reminder }
  | { kind: "confirmed"; reminder: Reminder }
  | { kind: "rejected"; code: "REMINDER_LIMIT_REACHED" }
  | { kind: "terminal"; code: "REMINDER_IDEMPOTENCY_CONFLICT" | "REMINDER_IDEMPOTENCY_INVALID" }
  | { kind: "unknown" | "stale" | "gated" | "blocked" };
export interface ReminderV2ReviewTransport {
  readonly uuidV4: () => string;
  /** Mock-only. Not bound to remindersApi or apiClient; no fallback. */
  readonly post: (request: ImmutableReminderV2Post) => Promise<ApiResponse<Reminder>>;
  /** Optional injected mock, no real GET until separate AG4 consumer authorization. */
  readonly ownerLookupMock?: (request: ImmutableReminderV2Get) => Promise<ApiResponse<Receipt>>;
}
type Operation = Readonly<{ actor: PushActor; key: string; body: Readonly<ReminderPayload> }>;
function snapshot(payload: ReminderPayload): Readonly<ReminderPayload> | null {
  const name = payload.name.trim();
  if (!name || name.length > 100 || !TIME.test(payload.reminderTime)) return null;
  const days = payload.reminderDays == null ? null : payload.reminderDays;
  if (days !== null && !DAYS.test(days)) return null;
  const rawTimezone = payload.timezone ?? "Europe/Moscow";
  let timezone: string;
  try {
    timezone = new Intl.DateTimeFormat("en", { timeZone: rawTimezone }).resolvedOptions().timeZone;
  } catch {
    reportClientError(new Error("REMINDER_V2_CANDIDATE_TIMEZONE_INVALID"), {
      issueKey: "ReminderV2Candidate",
      keys: { operation: "validate_timezone" },
    });
    return null;
  }
  const normalizedDays = days === null ? null : [...new Set(days.split(","))].sort().join(",");
  return Object.freeze({
    name,
    reminderTime: payload.reminderTime,
    reminderDays: normalizedDays,
    timezone,
  });
}
function equalReminder(saved: Reminder, draft: ReminderPayload): boolean {
  return (
    !!saved &&
    typeof saved.id === "string" &&
    saved.id.length > 0 &&
    saved.name === draft.name &&
    saved.reminderTime === draft.reminderTime &&
    saved.reminderDays === (draft.reminderDays ?? null) &&
    saved.timezone === draft.timezone
  );
}
export function createReminderV2ReviewCandidate(transport: ReminderV2ReviewTransport) {
  let intent: Operation | null = null;
  let inFlight = false;
  let acknowledgedId: string | null = null;
  let disposition: "idle" | "acknowledged" | "confirmed" | "unknown" | "rejected" | "terminal" =
    "idle";
  const scoped = (actor: PushActor, current: () => boolean) =>
    current() &&
    intent?.actor.ownerId === actor.ownerId &&
    intent.actor.authEpoch === actor.authEpoch;
  const unknown = (actor: PushActor, current: () => boolean): CandidateOutcome => {
    if (!scoped(actor, current)) return { kind: "stale" };
    disposition = "unknown";
    return { kind: "unknown" };
  };
  return {
    /** Exact same frozen key/payload is never repurposed. One POST ever per intent. */
    async create(
      actor: PushActor,
      payload: ReminderPayload,
      current: () => boolean,
    ): Promise<CandidateOutcome> {
      if (!current() || !actor.ownerId || !actor.authEpoch) return { kind: "stale" };
      if (intent || inFlight) return { kind: "blocked" };
      const body = snapshot(payload);
      if (!body) return { kind: "blocked" };
      let key: string;
      try {
        key = transport.uuidV4();
      } catch {
        reportClientError(new Error("REMINDER_V2_UUID_UNAVAILABLE"), {
          issueKey: "ReminderV2Candidate",
          keys: { operation: "allocate_uuid" },
        });
        return { kind: "blocked" };
      }
      if (!UUID_V4.test(key)) return { kind: "blocked" };
      intent = Object.freeze({ actor: Object.freeze({ ...actor }), key: key.toLowerCase(), body });
      inFlight = true;
      const guard = () => scoped(actor, current);
      const request = Object.freeze({
        method: "POST" as const,
        path: "/api/v1/reminders" as const,
        headers: Object.freeze({ "Idempotency-Key": intent.key }),
        body: intent.body,
        requestGuard: guard,
      });
      try {
        if (!guard()) return { kind: "stale" };
        const ack = await transport.post(request);
        if (!guard()) return { kind: "stale" };
        if (!ack.success) {
          if (ack.code === "REMINDER_LIMIT_REACHED") {
            disposition = "rejected";
            return { kind: "rejected", code: "REMINDER_LIMIT_REACHED" };
          }
          if (
            ack.code === "REMINDER_IDEMPOTENCY_CONFLICT" ||
            ack.code === "REMINDER_IDEMPOTENCY_INVALID"
          ) {
            disposition = "terminal";
            return { kind: "terminal", code: ack.code };
          }
          return unknown(actor, current);
        }
        if (!ack.data || !equalReminder(ack.data, intent.body)) return unknown(actor, current);
        acknowledgedId = ack.data.id;
        disposition = "acknowledged";
        return { kind: "acknowledged", reminder: ack.data };
      } catch {
        reportClientError(new Error("REMINDER_V2_CANDIDATE_POST_UNKNOWN"), {
          issueKey: "ReminderV2Candidate",
          keys: { operation: "post_unknown" },
        });
        return unknown(actor, current);
      } finally {
        inFlight = false;
      }
    },
    /** Existing screen performs own list readback after a positive server ACK only. */
    confirmList(
      actor: PushActor,
      rows: readonly Reminder[],
      current: () => boolean,
    ): CandidateOutcome {
      if (!scoped(actor, current)) return { kind: "stale" };
      if (disposition !== "acknowledged") return { kind: "blocked" };
      const exact = rows.find(
        (row) => row.id === acknowledgedId && equalReminder(row, intent!.body),
      );
      if (!exact) return unknown(actor, current);
      disposition = "confirmed";
      return { kind: "confirmed", reminder: exact };
    },
    markReadbackUnknown(actor: PushActor, current: () => boolean): CandidateOutcome {
      return intent ? unknown(actor, current) : { kind: "blocked" };
    },
    /** Manual owner lookup is REVIEW/MOCK only; never infer failure from 404. */
    async manualLookup(actor: PushActor, current: () => boolean): Promise<CandidateOutcome> {
      if (!scoped(actor, current)) return { kind: "stale" };
      if (disposition !== "unknown") return { kind: "blocked" };
      if (!transport.ownerLookupMock) return { kind: "gated" };
      const guard = () => scoped(actor, current);
      const request = Object.freeze({
        method: "GET" as const,
        path: `/api/v1/reminders/operations/${encodeURIComponent(intent!.key)}`,
        requestGuard: guard,
      });
      try {
        if (!guard()) return { kind: "stale" };
        const reply = await transport.ownerLookupMock(request);
        if (!guard()) return { kind: "stale" };
        if (
          !reply.success ||
          reply.data?.status !== "COMMITTED" ||
          !equalReminder(reply.data.reminder, intent!.body) ||
          (acknowledgedId !== null && reply.data.reminder.id !== acknowledgedId)
        )
          return unknown(actor, current);
        disposition = "confirmed";
        return { kind: "confirmed", reminder: reply.data.reminder };
      } catch {
        reportClientError(new Error("REMINDER_V2_CANDIDATE_LOOKUP_UNKNOWN"), {
          issueKey: "ReminderV2Candidate",
          keys: { operation: "lookup_unknown" },
        });
        return unknown(actor, current);
      }
    },
    /** Safe UI state; deliberately excludes UUID, payload, owner and authEpoch. */
    state: () => disposition,
  };
}
export type ReminderV2ReviewCandidate = ReturnType<typeof createReminderV2ReviewCandidate>;

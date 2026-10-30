import { ApiError } from "../../shared/api/client";
import type { DurableMockController } from "./reminderV2DurableSourceMock";
import {
  projectReminder,
  matchesNewReminder,
  type ReminderCreateBody,
  type TrainingReminder,
} from "./remindersSourceMock";

/** Reminder V2: optional HTTP Idempotency-Key HEADER UUIDv4. This is NOT the
 * G05 pet-create JSON clientRequestId contract. No live HTTP or persistence.
 * Journal lives only in injected test-owned memory, never in localStorage.
 */
export const REMINDER_V2_FIXTURE = "AG2_REMINDER_V2_HEADER_SYNTHETIC_ONLY" as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ReminderV2Status =
  | "UNKNOWN"
  | "ACK_MOCK"
  | "REJECTED_CAP"
  | "REJECTED"
  | "CONFLICT_TERMINAL"
  | "LOOKUP_COMMITTED"
  | "SERVER_COMMITTED_UNVERIFIED_DRAFT"
  | "LOOKUP_UNKNOWN";
export type ReminderV2Intent = {
  readonly ownerId: string;
  readonly idempotencyKey: string;
  readonly body: Readonly<ReminderCreateBody>;
  readonly status: ReminderV2Status;
  readonly lookupUsed: boolean;
};
export type ReminderV2Journal = {
  read(ownerId: string): ReminderV2Intent | null;
  begin(ownerId: string, body: ReminderCreateBody, key: string): ReminderV2Intent | null;
  set(ownerId: string, status: ReminderV2Status): void;
  takeLookup(ownerId: string): ReminderV2Intent | null;
  /** AG4 and user session-reset control; callers never reuse an operation key. */
  clear(): void;
};
const owned = (s: string) => /^[A-Za-z0-9_-]{1,128}$/.test(s);
export function reminderV2Key(key: string): string {
  if (!uuid.test(key) || key.length > 64) throw Error("REMINDER_V2_KEY_INVALID");
  return key.toLowerCase();
}
export const reminderV2LookupPath = (key: string) =>
  "/api/v1/reminders/operations/" + reminderV2Key(key);
export function reminderV2Payload(body: ReminderCreateBody): ReminderCreateBody {
  // Exactly the existing Hono POST JSON fields, no owner or clientRequestId.
  return Object.freeze({
    name: body.name,
    reminderTime: body.reminderTime,
    reminderDays: body.reminderDays,
    timezone: body.timezone,
  });
}
export function makeReminderV2Journal(): ReminderV2Journal {
  let current: ReminderV2Intent | null = null;
  return {
    read(ownerId) {
      return owned(ownerId) && current?.ownerId === ownerId ? current : null;
    },
    begin(ownerId, body, key) {
      if (!owned(ownerId) || current !== null) return null;
      const intent: ReminderV2Intent = Object.freeze({
        ownerId,
        idempotencyKey: reminderV2Key(key),
        body: reminderV2Payload(body),
        status: "UNKNOWN",
        lookupUsed: false,
      });
      current = intent;
      return intent;
    },
    set(ownerId, status) {
      if (current?.ownerId === ownerId) current = Object.freeze({ ...current, status });
    },
    takeLookup(ownerId) {
      if (
        !current ||
        current.ownerId !== ownerId ||
        current.lookupUsed ||
        !["UNKNOWN", "LOOKUP_UNKNOWN"].includes(current.status)
      )
        return null;
      current = Object.freeze({ ...current, lookupUsed: true });
      return current;
    },
    clear() {
      current = null;
    },
  };
}
export type ReminderV2Transport = {
  fixtureKind: typeof REMINDER_V2_FIXTURE;
  journal: ReminderV2Journal;
  /** AG4 source/mock-only injected async CAS, never real browser storage. */
  durable?: DurableMockController;
  create: (request: {
    ownerId: string;
    method: "POST";
    path: "/api/v1/reminders";
    headers: { "Idempotency-Key": string };
    body: ReminderCreateBody;
  }) => Promise<unknown>;
  lookup: (request: { ownerId: string; method: "GET"; path: string }) => Promise<unknown>;
};
type V2Result = { kind: ReminderV2Status; status?: number };
const record = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
export function classifyV2Create(raw: unknown, body: ReminderCreateBody): V2Result {
  const r = record(raw);
  if (!r || typeof r.httpStatus !== "number") return { kind: "UNKNOWN" };
  if (r.httpStatus === 200 && r.success === true && matchesNewReminder(r.data, body))
    return { kind: "ACK_MOCK" };
  if (r.httpStatus === 400 && r.success === false && r.code === "REMINDER_LIMIT_REACHED")
    return { kind: "REJECTED_CAP", status: 400 };
  if (r.httpStatus === 409 && r.success === false) {
    if (r.code === "REMINDER_IDEMPOTENCY_CONFLICT")
      return { kind: "CONFLICT_TERMINAL", status: 409 };
    if (r.code === "REMINDER_OPERATION_UNKNOWN") return { kind: "UNKNOWN", status: 409 };
  }
  if ([400, 401, 403, 404, 422, 429].includes(r.httpStatus) && r.success === false)
    return { kind: "REJECTED", status: r.httpStatus };
  return { kind: "UNKNOWN" };
}
/** The ordinary Web API client THROWS ApiError for 4xx, whereas synthetic
 * transports may resolve an HTTP envelope. Only explicit typed server
 * statuses/codes are terminal. Network failure, 5xx and missing code UNKNOWN.
 */
export function classifyV2CreateError(error: unknown): { kind: ReminderV2Status; status?: number } {
  if (!(error instanceof ApiError)) return { kind: "UNKNOWN" };
  if (error.status === 400 && error.code === "REMINDER_LIMIT_REACHED")
    return { kind: "REJECTED_CAP", status: 400 };
  if (error.status === 409 && error.code === "REMINDER_IDEMPOTENCY_CONFLICT")
    return { kind: "CONFLICT_TERMINAL", status: 409 };
  if (error.status === 409 && error.code === "REMINDER_OPERATION_UNKNOWN")
    return { kind: "UNKNOWN", status: 409 };
  if ([400, 401, 403, 404, 422, 429].includes(error.status))
    return { kind: "REJECTED", status: error.status };
  return { kind: "UNKNOWN" };
}
export function classifyV2Lookup(
  raw: unknown,
  body: ReminderCreateBody,
): "LOOKUP_COMMITTED" | "LOOKUP_UNKNOWN" {
  const r = record(raw),
    data = record(r?.data);
  if (r?.httpStatus !== 200 || r.success !== true || data?.status !== "COMMITTED")
    return "LOOKUP_UNKNOWN";
  try {
    const reminder: TrainingReminder = projectReminder(data.reminder);
    return matchesNewReminder(reminder, body) ? "LOOKUP_COMMITTED" : "LOOKUP_UNKNOWN";
  } catch {
    return "LOOKUP_UNKNOWN";
  }
}

/** Cold-restart GET has no original draft, by design: COMMITTED can
 * confirm an owned receipt, but NOT exact previous draft equivalence.
 * Never convert 404/5xx into "did not write".
 */
export function classifyV2DurableLookup(
  raw: unknown,
): "SERVER_COMMITTED_UNVERIFIED_DRAFT" | "LOOKUP_UNKNOWN" {
  const r = record(raw),
    data = record(r?.data);
  if (r?.httpStatus !== 200 || r.success !== true || data?.status !== "COMMITTED")
    return "LOOKUP_UNKNOWN";
  try {
    projectReminder(data.reminder);
    return "SERVER_COMMITTED_UNVERIFIED_DRAFT";
  } catch {
    return "LOOKUP_UNKNOWN";
  }
}

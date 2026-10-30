import { apiRequest, ApiError } from "../../shared/api/client";
import {
  projectReminder, projectReminders, reminderPath, matchesNewReminder,
  validateReminderChanges, validateReminderCreate,
  type ReminderCreateBody, type ReminderChanges, type TrainingReminder,
} from "./remindersSourceMock";

export async function listOwnReminders(): Promise<TrainingReminder[]> {
  return projectReminders(await apiRequest<unknown>("/api/v1/reminders", {
    method: "GET", browserAuth: true, expectedStatus: 200,
  }));
}

function sameFields(row: TrainingReminder, draft: ReminderCreateBody): boolean {
  return matchesNewReminder(row, draft);
}
const operationPath = (key: string): string => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))
    throw Error("INVALID_REMINDER_OPERATION_KEY");
  return "/api/v1/reminders/operations/" + key;
};

export type CreateReminderResult = {
  state: "confirmed" | "unknown";
  rows: TrainingReminder[];
  id?: string;
};

/** Never retry a potentially committed POST. A lost ACK is resolved by
 * owner-scoped GET operation receipt, then by owner list (no optimistic insert). */
export async function createOwnReminderAndVerify(
  draft: ReminderCreateBody, key = crypto.randomUUID(),
): Promise<CreateReminderResult> {
  const validated = validateReminderCreate(draft);
  if (!validated.ok) throw Error(validated.message);
  const before = await listOwnReminders();
  if (before.length >= 5) throw Error("Максимум 5 напоминаний");
  let submitted: TrainingReminder | null = null;
  try {
    const response = await fetch("/api/v1/reminders", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json",
        "X-Gafus-Auth-Transport": "cookie", "Idempotency-Key": key },
      body: JSON.stringify(validated.body),
    });
    let envelope: { success?: boolean; data?: unknown; error?: string; code?: string };
    try { envelope = await response.json() as typeof envelope; }
    catch { throw new Error("REMINDER_ACK_UNKNOWN"); }
    if (response.ok && response.status === 200 && envelope?.success === true) {
      submitted = projectReminder(envelope.data);
      if (!sameFields(submitted, validated.body)) throw Error("REMINDER_ACK_SHAPE_CHANGED");
    } else if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
      if (response.status !== 409 || envelope?.code === "REMINDER_IDEMPOTENCY_CONFLICT")
        throw new ApiError(response.status, "Напоминание отклонено", envelope?.code);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Lost ACK is indeterminate, including TCP error after SQL COMMIT.
  }
  if (!submitted) {
    try {
      const status = await apiRequest<unknown>(operationPath(key), {
        method: "GET", browserAuth: true, expectedStatus: 200,
      });
      const receipt = status as { status?: unknown; reminder?: unknown };
      if (receipt?.status === "COMMITTED") {
        const row = projectReminder(receipt.reminder);
        if (sameFields(row, validated.body)) submitted = row;
      }
    } catch { /* Lookup negative stays UNKNOWN; never retry the write. */ }
  }
  const rows = await listOwnReminders();
  if (!submitted) return { state: "unknown", rows };
  const confirmed = rows.find(item => item.id === submitted.id);
  return confirmed && sameFields(confirmed, validated.body)
    ? { state: "confirmed", rows, id: confirmed.id }
    : { state: "unknown", rows };
}

/** Only a server-refetched exact field match proves PUT. */
export async function changeOwnReminderAndVerify(
  original: TrainingReminder, draft: TrainingReminder,
): Promise<{ confirmed: boolean; rows: TrainingReminder[] }> {
  const changes = validateReminderChanges(original, draft);
  if (!changes.ok) throw Error(changes.message);
  try {
    const raw = await apiRequest<unknown>(reminderPath(original.id), {
      method: "PUT", browserAuth: true, json: changes.changes, expectedStatus: 200,
    });
    const ack = projectReminder(raw);
    if (ack.id !== original.id) throw Error("REMINDER_PUT_OWNER_MISMATCH");
  } catch (error) {
    if (error instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(error.status))
      throw error;
  }
  const rows = await listOwnReminders();
  const updated = rows.find(row => row.id === original.id);
  return { confirmed: !!updated && Object.entries(changes.changes)
    .every(([k, value]) => updated[k as keyof TrainingReminder] === value), rows };
}

/** Toggle and delete are not idempotent on transport by assumption. Read back
 * owner list and never repeat after ambiguous HTTP failures. */
export async function deleteOwnReminderAndVerify(id: string): Promise<{
  confirmed: boolean; rows: TrainingReminder[];
}> {
  try {
    await apiRequest<unknown>(reminderPath(id), {
      method: "DELETE", browserAuth: true, expectedStatus: 200,
    });
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404, 429].includes(error.status)) throw error;
  }
  const rows = await listOwnReminders();
  return { confirmed: rows.every(row => row.id !== id), rows };
}

export function daySelection(days: string | null): string[] {
  return days === null ? [] : days.split(",");
}
export function serializeDays(days: string[]): string | null {
  return days.length ? [...new Set(days)].sort().join(",") : null;
}
export type { ReminderChanges };

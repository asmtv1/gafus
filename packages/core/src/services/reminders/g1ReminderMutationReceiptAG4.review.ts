/** AG4-approved design, SOURCE REVIEW ONLY. Shared migration NOT permitted. */
import { createHash } from "node:crypto";
import { prisma, isPrismaUniqueConstraintError } from "@gafus/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = /^[1-7](,[1-7])*$/;
const TYPE = "training";
const RETAIN_MS = 30 * 24 * 60 * 60 * 1000;
export type Draft = { name: string; reminderTime: string; reminderDays?: string | null;
  timezone?: string | null };
export type ReminderWire = Record<string, unknown> & { id: string };
export type CreateOutcome = { kind: "created" | "idempotent_replay"; reminder: ReminderWire };
export type OperationCommitted = { status: "COMMITTED"; reminder: ReminderWire };
export class ReminderConflictError extends Error {
  readonly code = "REMINDER_IDEMPOTENCY_CONFLICT";
  constructor() { super("Reminder key conflict"); this.name = "ReminderConflictError"; }
}
export class ReminderUnknownError extends Error {
  readonly code = "REMINDER_OPERATION_UNKNOWN";
  constructor() { super("Reminder outcome unknown"); this.name = "ReminderUnknownError"; }
}
export class ReminderInvalidError extends Error {
  readonly code = "REMINDER_IDEMPOTENCY_INVALID";
  constructor() { super("Invalid reminder input"); this.name = "ReminderInvalidError"; }
}
export class ReminderCapError extends Error {
  readonly code = "REMINDER_LIMIT_REACHED";
  constructor() { super("Максимум 5 напоминаний"); this.name = "ReminderCapError"; }
}
export const validateKey = (key: string): string => {
  if (typeof key !== "string" || key.length > 64 || !UUID.test(key)) {
    throw new ReminderInvalidError();
  }
  return key.toLowerCase();
};
export function normalizeDraft(v: Draft) {
  if (typeof v.name !== "string" || typeof v.reminderTime !== "string" ||
      !CLOCK.test(v.reminderTime) || (v.reminderDays != null && !DAYS.test(v.reminderDays))) {
    throw new ReminderInvalidError();
  }
  const name = v.name.trim();
  if (!name || name.length > 100) throw new ReminderInvalidError();
  let timezone: string;
  try {
    timezone = new Intl.DateTimeFormat("en", {
      timeZone: v.timezone || "Europe/Moscow",
    }).resolvedOptions().timeZone;
  } catch { throw new ReminderInvalidError(); }
  return { name, reminderTime: v.reminderTime,
    reminderDays: v.reminderDays ? [...new Set(v.reminderDays.split(","))].sort().join(",") : null,
    timezone };
}
export function fingerprintDraft(draft: Draft): string {
  const v = normalizeDraft(draft);
  return createHash("sha256").update(JSON.stringify([
    "gafus.reminder.CREATE.v1", v.name, v.reminderTime, v.reminderDays, v.timezone,
  ])).digest("hex");
}
function snapshot(value: unknown): ReminderWire {
  const result = JSON.parse(JSON.stringify(value)) as ReminderWire;
  if (!result || typeof result.id !== "string" || !result.id) throw new ReminderUnknownError();
  return result;
}
type Receipt = { operationKind: string; fingerprint: string; state: string; responseJson: unknown;
  reminderId: string | null; expiresAt: Date };
function current(r: Receipt): boolean {
  return r.state === "COMMITTED" && r.expiresAt.getTime() > Date.now() &&
    r.responseJson !== null && !!r.reminderId;
}
export async function createReminderAG4(
  owner: string, draft: Draft, rawKey: string,
): Promise<CreateOutcome> {
  const key = validateKey(rawKey), normalized = normalizeDraft(draft);
  const hash = fingerprintDraft(normalized);
  if (!owner) throw new ReminderInvalidError();
  try {
    return await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${owner}
        AND "registrationPending" = false FOR UPDATE
    `;
    if (users.length !== 1) throw new ReminderInvalidError();
    const prior = await tx.$queryRaw<Receipt[]>`
      SELECT "operationKind", "fingerprint", "state", "responseJson", "reminderId", "expiresAt"
      FROM "ReminderMutationReceipt" WHERE "ownerUserId" = ${owner}
        AND "operationKey" = ${key} LIMIT 1
    `;
    if (prior[0]) {
      // Tombstone and expired key MUST NOT authorize new creation.
      if (!current(prior[0])) throw new ReminderUnknownError();
      if (prior[0].operationKind !== "CREATE" || prior[0].fingerprint !== hash) {
        throw new ReminderConflictError();
      }
      const present = await tx.reminder.findFirst({
        where: { id: prior[0].reminderId!, userId: owner, type: "training" },
        select: { id: true },
      });
      if (!present) throw new ReminderUnknownError();
      return { kind: "idempotent_replay", reminder: snapshot(prior[0].responseJson) };
    }
    // PENDING row + Reminder + COMMITTED response all in ONE PG transaction.
    await tx.$executeRaw`
      INSERT INTO "ReminderMutationReceipt"
        ("ownerUserId", "operationKey", "operationKind", "fingerprint",
         "state", "responseJson", "expiresAt", "createdAt")
      VALUES (${owner}, ${key}, 'CREATE', ${hash}, 'PENDING', NULL,
        ${new Date(Date.now() + RETAIN_MS)}, now())
    `;
    const count = await tx.reminder.count({ where: { userId: owner, type: TYPE } });
    if (count >= 5) throw new ReminderCapError();
    const created = await tx.reminder.create({ data: {
      userId: owner, type: TYPE, name: normalized.name, enabled: true,
      reminderTime: normalized.reminderTime, reminderDays: normalized.reminderDays,
      timezone: normalized.timezone,
    } });
    const response = snapshot(created);
    const updated = await tx.$executeRaw`
      UPDATE "ReminderMutationReceipt" SET "state" = 'COMMITTED',
        "reminderId" = ${created.id}, "responseJson" = ${JSON.stringify(response)}::jsonb
      WHERE "ownerUserId" = ${owner} AND "operationKey" = ${key} AND "state" = 'PENDING'
    `;
    if (updated !== 1) throw new ReminderUnknownError();
    return { kind: "created", reminder: response };
    });
  } catch (error) {
    // Unexpected concurrent writer with a unique constraint: never leak P2002
    // as HTTP 500. Return 409 UNKNOWN, client must do authenticated GET only.
    if (isPrismaUniqueConstraintError(error)) throw new ReminderUnknownError();
    throw error;
  }
}
export async function lookupReminderAG4(
  owner: string, rawKey: string,
): Promise<OperationCommitted> {
  const key = validateKey(rawKey);
  if (!owner) throw new ReminderInvalidError();
  const rows = await prisma.$queryRaw<Receipt[]>`
    SELECT "operationKind", "fingerprint", "state", "responseJson", "reminderId", "expiresAt"
    FROM "ReminderMutationReceipt" WHERE "ownerUserId" = ${owner}
      AND "operationKey" = ${key} AND "operationKind" = 'CREATE' LIMIT 1
  `;
  if (!rows[0] || !current(rows[0])) throw new ReminderUnknownError();
  const present = await prisma.reminder.findFirst({
    where: { id: rows[0].reminderId!, userId: owner, type: TYPE },
    select: { id: true },
  });
  if (!present) throw new ReminderUnknownError();
  return { status: "COMMITTED", reminder: snapshot(rows[0].responseJson) };
}

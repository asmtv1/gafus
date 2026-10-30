/**
 * AG1 reminder create/lookup REVIEW ONLY. Not exported from Core index and not
 * called by any live route. Needs AG4 shared Prisma schema/migration gate.
 */
import { createHash } from "node:crypto";
import { prisma } from "@gafus/prisma";

const TYPE = "training";
const DEFAULT_TZ = "Europe/Moscow";
const MAX_REMINDERS = 5;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = /^[1-7](,[1-7])*$/;

export type ReminderCreateDraft = {
  name: string;
  reminderTime: string;
  reminderDays?: string | null;
  timezone?: string | null;
};
export type ReminderCreateJson = Record<string, unknown> & { id: string };
export type ReminderCreateResult = {
  kind: "created" | "idempotent_replay";
  reminder: ReminderCreateJson;
};
export type ReminderCreateLookup =
  | { state: "UNKNOWN" }
  | { state: "FOUND"; reminder: ReminderCreateJson };

export class ReminderIdempotencyConflictError extends Error {
  readonly code = "REMINDER_IDEMPOTENCY_CONFLICT";
  constructor() {
    super("Reminder idempotency key already used for a different payload");
    this.name = "ReminderIdempotencyConflictError";
  }
}
export class ReminderIdempotencyInvalidError extends Error {
  readonly code = "REMINDER_IDEMPOTENCY_INVALID";
  constructor() {
    super("Reminder create key or payload is invalid");
    this.name = "ReminderIdempotencyInvalidError";
  }
}
export class ReminderLimitError extends Error {
  readonly code = "REMINDER_LIMIT_REACHED";
  constructor() {
    super("Максимум 5 напоминаний");
    this.name = "ReminderLimitError";
  }
}

export type CanonicalReminderDraft = {
  name: string;
  reminderTime: string;
  reminderDays: string | null;
  timezone: string;
};
export function canonicalReminderDraft(draft: ReminderCreateDraft): CanonicalReminderDraft {
  if (typeof draft.name !== "string" || draft.name.length < 1 || draft.name.length > 100 ||
      typeof draft.reminderTime !== "string" || !TIME.test(draft.reminderTime) ||
      (draft.reminderDays != null && !DAYS.test(draft.reminderDays))) {
    throw new ReminderIdempotencyInvalidError();
  }
  let tz: string;
  try {
    tz = new Intl.DateTimeFormat("en", {
      timeZone: draft.timezone || DEFAULT_TZ,
    }).resolvedOptions().timeZone;
  } catch {
    throw new ReminderIdempotencyInvalidError();
  }
  const days = draft.reminderDays
    ? [...new Set(draft.reminderDays.split(","))].sort().join(",") : null;
  return {
    name: draft.name,
    reminderTime: draft.reminderTime,
    reminderDays: days,
    timezone: tz,
  };
}

export function reminderPayloadFingerprint(draft: ReminderCreateDraft): string {
  const c = canonicalReminderDraft(draft);
  // An array fixes field order and includes schema revision + reminder type.
  return createHash("sha256").update(JSON.stringify([
    "gafus.reminder.create.v1", TYPE, c.name, c.reminderTime,
    c.reminderDays, c.timezone,
  ])).digest("hex");
}

export function assertReminderCreateKey(key: string): string {
  if (typeof key !== "string" || !UUID_V4.test(key)) {
    throw new ReminderIdempotencyInvalidError();
  }
  return key.toLowerCase();
}

function snapshot(value: unknown): ReminderCreateJson {
  // Prisma dates become strings on JSON wire. Persist THAT representation in
  // receipt so lost-ACK replay equals the original HTTP JSON response exactly.
  const result = JSON.parse(JSON.stringify(value)) as ReminderCreateJson;
  if (!result || typeof result.id !== "string" || !result.id) {
    throw new Error("Invalid reminder create snapshot");
  }
  return result;
}

type Receipt = { fingerprint: string; responseJson: unknown };

export async function createReminderWithReceipt(
  verifiedOwnerId: string,
  draft: ReminderCreateDraft,
  untrustedKey: string,
): Promise<ReminderCreateResult> {
  const key = assertReminderCreateKey(untrustedKey);
  const canonical = canonicalReminderDraft(draft);
  const fingerprint = reminderPayloadFingerprint(canonical);
  if (!verifiedOwnerId) throw new ReminderIdempotencyInvalidError();
  return prisma.$transaction(async (tx) => {
    // All keyed creates for one owner are serialized across API processes.
    // POST with NO key still calls legacy createReminder and is NOT fenced.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(615721, hashtext(${verifiedOwnerId}))`;
    const existing = await tx.$queryRaw<Receipt[]>`
      SELECT "fingerprint", "responseJson" FROM "ReminderCreateIdempotency"
      WHERE "userId" = ${verifiedOwnerId} AND "key" = ${key}
      LIMIT 1
    `;
    if (existing.length) {
      if (existing[0]?.fingerprint !== fingerprint) throw new ReminderIdempotencyConflictError();
      return { kind: "idempotent_replay", reminder: snapshot(existing[0]?.responseJson) };
    }
    const count = await tx.reminder.count({ where: { userId: verifiedOwnerId, type: TYPE } });
    if (count >= MAX_REMINDERS) throw new ReminderLimitError();
    const created = await tx.reminder.create({
      data: {
        userId: verifiedOwnerId, type: TYPE, name: canonical.name,
        reminderTime: canonical.reminderTime, reminderDays: canonical.reminderDays,
        timezone: canonical.timezone, enabled: true,
      },
    });
    const responseJson = snapshot(created);
    // Receipt INSERT and Reminder CREATE commit or roll back together.
    // Includes immutable response snapshot even when reminder later edited.
    await tx.$executeRaw`
      INSERT INTO "ReminderCreateIdempotency"
        ("userId", "key", "fingerprint", "reminderId", "responseJson", "createdAt")
      VALUES (${verifiedOwnerId}, ${key}, ${fingerprint}, ${created.id}, ${JSON.stringify(responseJson)}::jsonb, now())
    `;
    return { kind: "created", reminder: responseJson };
  });
}

export async function lookupOwnReminderCreateReceipt(
  verifiedOwnerId: string,
  untrustedKey: string,
): Promise<ReminderCreateLookup> {
  const key = assertReminderCreateKey(untrustedKey);
  if (!verifiedOwnerId) throw new ReminderIdempotencyInvalidError();
  const result = await prisma.$queryRaw<{ responseJson: unknown }[]>`
    SELECT "responseJson" FROM "ReminderCreateIdempotency"
    WHERE "userId" = ${verifiedOwnerId} AND "key" = ${key}
    LIMIT 1
  `;
  if (!result[0]) return { state: "UNKNOWN" };
  return { state: "FOUND", reminder: snapshot(result[0].responseJson) };
}

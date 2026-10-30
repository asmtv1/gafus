/** AG1: opt-in, genuine login -> original Hono :3001 -> WORK PG18 receipt/CRUD. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

type ReminderRow = {
  id: string;
  name: string;
  enabled: boolean;
  reminderTime: string;
  reminderDays: string | null;
  timezone: string;
};
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const prefix = "ag1_reminders_20261025_";
const baseUrl = "http://127.0.0.1:3001/api/v1";
const actorA = { id: prefix + "a_" + randomBytes(5).toString("hex") };
const actorB = { id: prefix + "b_" + randomBytes(5).toString("hex") };
let seededA = false;
let seededB = false;
let phase = "PRECHECK";
let checkpoints = 0;

function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error("ACCEPTANCE_ASSERT_" + label);
}
function record(label: string, value: string | number) {
  checkpoints++;
  console.warn(`AG1_REMINDER ${label}=${value}`);
}
async function http(path: string, method = "GET", token?: string, body?: unknown, key?: string) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key === undefined ? {} : { "Idempotency-Key": key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const data = (await response.json()) as {
    success?: boolean;
    code?: string;
    data?: unknown;
  };
  return { status: response.status, data };
}
async function login(username: string, password: string): Promise<string> {
  const res = await http("/auth/login", "POST", undefined, { username, password });
  assert(
    res.status === 200 && res.data.success && typeof object(res.data.data).accessToken === "string",
    "REAL_LOGIN",
  );
  return object(res.data.data).accessToken as string;
}
async function list(token: string): Promise<ReminderRow[]> {
  const res = await http("/reminders", "GET", token);
  assert(res.status === 200 && res.data.success && Array.isArray(res.data.data), "GET_LIST");
  return res.data.data as ReminderRow[];
}
async function seed(actor: { id: string }, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      id: actor.id,
      username: actor.id,
      password: hash,
      passwordSetAt: new Date(),
      registrationPending: false,
      role: "USER",
    },
  });
}
async function removeOwn(actor: { id: string }) {
  const own = await prisma.user.findUnique({ where: { id: actor.id }, select: { username: true } });
  if (!own) return;
  assert(own.username === actor.id && own.username.startsWith(prefix), "CLEANUP_OWNER_GUARD");
  await prisma.user.delete({ where: { id: actor.id } });
}
async function main() {
  assert(process.env.AG1_REMINDERS_WORK_ACCEPT === "1", "EXPLICIT_OPTIN");
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "55921" &&
      url.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_DB_URL_GUARD",
  );
  phase = "REAL_SQL_GUARD";
  const check = await prisma.$queryRaw<{ db: string; version: string; receipt: string | null }[]>`
    SELECT current_database() AS db, current_setting('server_version_num') AS version,
      to_regclass('public."ReminderMutationReceipt"')::text AS receipt`;
  assert(
    check.length === 1 &&
      check[0].db === "gafus_refactor_real_work_20261024" &&
      check[0].version === "180004" &&
      check[0].receipt === '"ReminderMutationReceipt"',
    "REAL_SQL_GUARD",
  );
  phase = "HONO_HEALTH";
  const ready = await fetch("http://127.0.0.1:3001/health", { signal: AbortSignal.timeout(3500) });
  assert(ready.status === 200, "ORIGINAL_HONO_READY");
  record("PREFLIGHT_ORIGINAL_HONO_WORK_PG", "PASS");

  const passA = randomBytes(26).toString("base64url");
  const passB = randomBytes(26).toString("base64url");
  phase = "SEED";
  await seed(actorA, passA);
  seededA = true;
  await seed(actorB, passB);
  seededB = true;
  phase = "LOGIN";
  const tokenA = await login(actorA.id, passA);
  const tokenB = await login(actorB.id, passB);
  record("GENUINE_SIGNED_LOGIN_TWO_ACTORS", "PASS");

  phase = "KEYED_CREATE";
  const key = randomUUID();
  const draft = {
    name: "AG1 LOCAL REMINDER acceptance",
    reminderTime: "14:17",
    reminderDays: "3,1",
    timezone: "Europe/Moscow",
  };
  const created = await http("/reminders", "POST", tokenA, draft, key);
  assert(
    created.status === 200 &&
      created.data.success &&
      typeof object(created.data.data).id === "string",
    "KEYED_CREATE_HTTP",
  );
  const rowId = object(created.data.data).id as string;
  const sql = await prisma.reminder.findFirst({
    where: { id: rowId, userId: actorA.id, type: "training" },
  });
  assert(sql?.reminderDays === "1,3" && sql.timezone === "Europe/Moscow", "KEYED_SQL_READBACK");
  assert(
    (await list(tokenA)).some((r) => r.id === rowId),
    "KEYED_GET_READBACK",
  );
  record("KEYED_POST_SQL_GET", "PASS");

  phase = "LOOKUP_REPLAY";
  const lookup = await http(`/reminders/operations/${key}`, "GET", tokenA);
  assert(
    lookup.status === 200 &&
      object(lookup.data.data).status === "COMMITTED" &&
      object(object(lookup.data.data).reminder).id === rowId,
    "LOST_ACK_LOOKUP",
  );
  const replay = await http("/reminders", "POST", tokenA, draft, key);
  assert(replay.status === 200 && object(replay.data.data).id === rowId, "KEYED_REPLAY");
  assert(
    (await prisma.reminder.count({ where: { userId: actorA.id, type: "training" } })) === 1,
    "NO_DUPLICATE",
  );
  const receipt = await prisma.reminderMutationReceipt.findUnique({
    where: {
      ownerUserId_operationKey: { ownerUserId: actorA.id, operationKey: key },
    },
  });
  assert(receipt?.state === "COMMITTED" && receipt.reminderId === rowId, "RECEIPT_DURABLE_SQL");
  record("LOST_ACK_LOOKUP_REPLAY_NO_DUPLICATE", "PASS");

  phase = "FOREIGN_BOUNDARY";
  const foreignLookup = await http(`/reminders/operations/${key}`, "GET", tokenB);
  assert(
    foreignLookup.status === 404 && foreignLookup.data.code === "REMINDER_OPERATION_UNKNOWN",
    "FOREIGN_LOOKUP_MASKED",
  );
  const foreignEdit = await http(`/reminders/${rowId}`, "PUT", tokenB, { enabled: false });
  const foreignDelete = await http(`/reminders/${rowId}`, "DELETE", tokenB);
  assert(foreignEdit.status === 404 && foreignDelete.status === 404, "FOREIGN_OWNER_DENY");
  record("FOREIGN_LOOKUP_EDIT_DELETE_OWNER_DENIED", "PASS");

  phase = "KEYED_CONFLICT";
  const conflict = await http(
    "/reminders",
    "POST",
    tokenA,
    { ...draft, reminderTime: "14:18" },
    key,
  );
  assert(
    conflict.status === 409 && conflict.data.code === "REMINDER_IDEMPOTENCY_CONFLICT",
    "FINGERPRINT_CONFLICT",
  );
  record("KEYED_DIFFERENT_BODY_409", "PASS");

  phase = "EDIT";
  const update = await http(`/reminders/${rowId}`, "PUT", tokenA, {
    name: "AG1 updated local reminder",
    reminderTime: "18:42",
    reminderDays: "1,4,7",
    timezone: "Europe/London",
    enabled: false,
  });
  assert(update.status === 200 && update.data.success, "EDIT_HTTP");
  const updated = (await list(tokenA)).find((r) => r.id === rowId);
  const sqlUpdated = await prisma.reminder.findUnique({ where: { id: rowId } });
  assert(
    updated?.name === "AG1 updated local reminder" &&
      updated.reminderTime === "18:42" &&
      updated.reminderDays === "1,4,7" &&
      updated.timezone === "Europe/London" &&
      updated.enabled === false &&
      sqlUpdated?.enabled === false,
    "EDIT_SQL_GET_RECONCILIATION",
  );
  record("EDIT_TIMEZONE_DAYS_ENABLED_SQL_GET", "PASS");

  phase = "INVALID_INPUT";
  for (const bad of [
    { ...draft, reminderTime: "29:90" },
    { ...draft, reminderDays: "0,9" },
    { ...draft, timezone: "Invalid/NotAZone" },
  ]) {
    const denied = await http("/reminders", "POST", tokenA, bad);
    assert(denied.status === 400, "INVALID_INPUT_400");
  }
  assert((await list(tokenA)).length === 1, "INVALID_INPUT_NO_WRITE");
  record("INVALID_TIME_DAYS_ZONE_NO_WRITE", "PASS");

  phase = "LEGACY_AND_CAP";
  for (let i = 0; i < 4; i++) {
    const legacy = await http("/reminders", "POST", tokenA, {
      name: `AG1 LEGACY ${i}`,
      reminderTime: "23:58",
      reminderDays: null,
    });
    assert(legacy.status === 200 && legacy.data.success, "LEGACY_CREATE");
  }
  assert((await list(tokenA)).length === 5, "FIVE_CAP_SETUP");
  const sixth = await http("/reminders", "POST", tokenA, draft, randomUUID());
  assert(sixth.status === 400 && sixth.data.code === "REMINDER_LIMIT_REACHED", "FIVE_CAP_DENIAL");
  assert(
    (await prisma.reminder.count({ where: { userId: actorA.id, type: "training" } })) === 5,
    "NO_SIXTH_SQL",
  );
  record("KEYLESS_LEGACY_AND_FIVE_CAP", "PASS");

  phase = "DELETE_RECONCILE";
  const deleted = await http(`/reminders/${rowId}`, "DELETE", tokenA);
  assert(deleted.status === 200 && deleted.data.success, "OWNER_DELETE_HTTP");
  assert(
    (await list(tokenA)).length === 4 &&
      (await prisma.reminder.count({ where: { id: rowId } })) === 0,
    "DELETE_SQL_GET",
  );
  const spent = await http(`/reminders/operations/${key}`, "GET", tokenA);
  assert(
    spent.status === 404 && spent.data.code === "REMINDER_OPERATION_UNKNOWN",
    "SPENT_KEY_NO_RESULT",
  );
  const unknownReplay = await http("/reminders", "POST", tokenA, draft, key);
  assert(
    unknownReplay.status === 409 && unknownReplay.data.code === "REMINDER_OPERATION_UNKNOWN",
    "SPENT_KEY_NO_NEW_CREATE",
  );
  record("DELETE_SQL_GET_SPENT_KEY_TOMBSTONE", "PASS");
  record("CHECKPOINTS_TOTAL", checkpoints);
}
try {
  await main();
} catch (err) {
  process.exitCode = 1;
  const message =
    err instanceof Error && err.message.startsWith("ACCEPTANCE_ASSERT_")
      ? err.message
      : "UNEXPECTED_FAILURE_REDACTED";
  const code =
    err && typeof err === "object" && "code" in err ? String(err.code).slice(0, 25) : "NO_CODE";
  const name = err instanceof Error ? err.name.replace(/[^A-Za-z]/g, "").slice(0, 40) : "UNKNOWN";
  console.error(
    `AG1_REMINDER_FAILED_PHASE=${phase} CODE=${message} ERROR_TYPE=${name} ERROR_CODE=${code}`,
  );
} finally {
  try {
    if (seededA) await removeOwn(actorA);
    if (seededB) await removeOwn(actorB);
    if (seededA || seededB) record("OWN_SYNTHETIC_USERS_CLEANED", "PASS");
  } catch {
    process.exitCode = 1;
    console.error("AG1_REMINDER_CLEANUP_FAILURE_REQUIRES_OWN_MARKER_REVIEW");
  }
  await prisma.$disconnect();
}

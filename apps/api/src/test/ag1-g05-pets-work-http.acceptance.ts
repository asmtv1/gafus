/** G05 real login -> original Hono/CORE -> real WORK PostgreSQL18. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_g05_http_20261025_" + randomBytes(5).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
const obj = (data: unknown): Record<string, unknown> =>
  data !== null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
function ensure(ok: unknown, code: string): asserts ok {
  if (!ok) throw Error(`ASSERT_${code}`);
}
function pass(name: string) {
  console.warn(`AG1_G05_HTTP ${name}=PASS`);
}
type Actor = { id: string; username: string; password: string };
let a: Actor | null = null;
let b: Actor | null = null;
let petId = "";
let weightEntryId = "";
let phase = "PRECHECK";
let initialPetCount = 0;
let initialEntryCount = 0;
let initialReceiptCount = 0;
async function api(
  path: string,
  method = "GET",
  actor?: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${actor}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: r.status, headers: r.headers, body: obj(await r.json()) };
}
async function actor(suffix: string): Promise<Actor> {
  const username = prefix + "_" + suffix;
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({
    data: {
      username,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      role: "USER",
      registrationPending: false,
    },
  });
  return { id: user.id, username, password };
}
async function login(user: Actor) {
  const result = await api("/auth/login", "POST", undefined, {
    username: user.username,
    password: user.password,
  });
  ensure(result.status === 200 && result.body.success === true, "AUTH_SUCCESS");
  const token = obj(result.body.data).accessToken;
  ensure(typeof token === "string" && token.length > 30, "REAL_TOKEN");
  return token;
}
async function cleanup() {
  if (petId && a) {
    const p = await prisma.pet.findUnique({
      where: { id: petId },
      select: { ownerId: true, name: true },
    });
    if (p?.ownerId === a.id && p.name.startsWith("AG1 G05")) {
      await prisma.pet.deleteMany({ where: { id: petId, ownerId: a.id } });
    }
  }
  for (const user of [a, b])
    if (user) {
      const actual = await prisma.user.findUnique({
        where: { id: user.id },
        select: { username: true },
      });
      if (actual?.username === user.username && actual.username.startsWith(prefix)) {
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
}
async function main() {
  ensure(process.env.AG1_G05_WORK_HTTP === "1", "EXPLICIT_OPTIN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["localhost", "127.0.0.1"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_DB_ONLY",
  );
  const meta = await prisma.$queryRaw<{ db: string; receipt: string | null }[]>`
    SELECT current_database() AS db,to_regclass('public."PetCreateReceipt"')::text AS receipt`;
  ensure(
    meta.length === 1 &&
      meta[0].db === "gafus_refactor_real_work_20261024" &&
      meta[0].receipt === '"PetCreateReceipt"',
    "WORK_SCHEMA_PRECHECK",
  );
  initialPetCount = await prisma.pet.count();
  initialEntryCount = await prisma.petWeightEntry.count();
  const count = await prisma.$queryRaw<
    { value: bigint }[]
  >`SELECT count(*) AS value FROM "PetCreateReceipt"`;
  initialReceiptCount = Number(count[0]?.value ?? 0n);
  const ready = await fetch("http://127.0.0.1:3001/health", { signal: AbortSignal.timeout(5000) });
  ensure(ready.status === 200, "HONO_HEALTH");
  pass("HONO_CORE_WORK_SCHEMA");
  phase = "AUTH";
  a = await actor("owner");
  b = await actor("foreign");
  const own = await login(a),
    other = await login(b);
  pass("GENUINE_TWO_ACTOR_LOGIN");
  phase = "KEYED_CREATE";
  const key = randomUUID();
  const request = {
    name: "AG1 G05 test pet",
    type: "DOG",
    breed: "Mixed",
    birthDate: "2020-02-29",
    weightKg: 12.75,
    notes: "AG1 synthetic only",
    clientRequestId: key,
  };
  const created = await api("/pets", "POST", own, request);
  ensure(created.status === 201 && created.body.success === true, "CREATE_201");
  petId = obj(created.body.data).id as string;
  ensure(typeof petId === "string" && petId.length > 12, "PET_ID");
  const pet = await prisma.pet.findFirst({ where: { id: petId, ownerId: a.id } });
  ensure(
    pet?.name === request.name &&
      pet.weightKg === 12.75 &&
      pet.birthDate.toISOString() === "2020-02-29T00:00:00.000Z",
    "CREATE_SQL_FIELDS",
  );
  const receipt = await prisma.$queryRaw<{ petId: string; responseStatus: number }[]>`
    SELECT "petId","responseStatus" FROM "PetCreateReceipt"
    WHERE "ownerId"=${a.id} AND "clientRequestId"=${key}::uuid`;
  ensure(
    receipt.length === 1 && receipt[0].petId === petId && receipt[0].responseStatus === 201,
    "RECEIPT_SQL",
  );
  const detail = await api(`/pets/${petId}`, "GET", own);
  ensure(detail.status === 200 && obj(detail.body.data).id === petId, "CREATE_GET_READBACK");
  pass("KEYED_CREATE_PET_WEIGHT_BIRTHDATE_RECEIPT_SQL_GET");
  phase = "REPLAY_FOREIGN";
  const replay = await api("/pets", "POST", own, request);
  ensure(
    replay.status === 201 &&
      obj(replay.body.data).id === petId &&
      replay.headers.get("Idempotent-Replayed") === "true",
    "LOST_ACK_REPLAY",
  );
  const conflict = await api("/pets", "POST", own, { ...request, breed: "Changed" });
  ensure(
    conflict.status === 409 && conflict.body.code === "PET_CREATE_REQUEST_CONFLICT",
    "REPLAY_CONFLICT",
  );
  const badHeader = await api("/pets", "POST", own, request, { "Idempotency-Key": randomUUID() });
  ensure(
    badHeader.status === 400 && badHeader.body.code === "UNSUPPORTED_IDEMPOTENCY_TRANSPORT",
    "HEADER_UNSUPPORTED",
  );
  ensure((await prisma.pet.count({ where: { ownerId: a.id } })) === 1, "NO_DUPLICATE");
  const foreign = await api(`/pets/${petId}`, "GET", other);
  ensure(foreign.status === 404, "FOREIGN_GET_404");
  const foreignWeight = await api(`/pets/${petId}/weight`, "GET", other);
  ensure(foreignWeight.status === 404, "FOREIGN_WEIGHT_404");
  const foreignDelete = await api(`/pets/${petId}`, "DELETE", other);
  ensure(foreignDelete.status === 404, "FOREIGN_DELETE_404");
  pass("REPLAY_CONFLICT_NO_DUPLICATES_OWNER_PRIVATE");
  phase = "WEIGHT_HISTORY";
  const initial = await api(`/pets/${petId}/weight`, "GET", own);
  ensure(
    initial.status === 200 && obj(initial.body.data).currentWeightKg === 12.75,
    "INITIAL_WEIGHT_GET",
  );
  const weight = await api(`/pets/${petId}/weight`, "POST", own, {
    weightKg: 13.5,
    measuredAt: "2026-10-24T08:30:00.000Z",
  });
  ensure(weight.status === 201 && weight.body.success, "NEW_WEIGHT_201");
  weightEntryId = obj(weight.body.data).id as string;
  ensure(typeof weightEntryId === "string", "WEIGHT_ENTRY_ID");
  const entry = await prisma.petWeightEntry.findFirst({
    where: { id: weightEntryId, ownerId: a.id, petId },
  });
  ensure(entry?.weightKg === 13.5, "WEIGHT_SQL");
  const history = await api(`/pets/${petId}/weight`, "GET", own);
  ensure(
    history.status === 200 && obj(history.body.data).currentWeightKg === 13.5,
    "NEW_WEIGHT_GET",
  );
  const target = await api(`/pets/${petId}/weight/target`, "PUT", own, { targetWeightKg: 14 });
  ensure(target.status === 200 && target.body.success, "TARGET_SET");
  const after = await api(`/pets/${petId}/weight`, "GET", own);
  ensure(obj(after.body.data).targetWeightKg === 14, "TARGET_GET");
  const invalid = await api(`/pets/${petId}/weight`, "POST", own, {
    weightKg: -5,
    measuredAt: "2026-10-24T08:30:00.000Z",
  });
  ensure(invalid.status === 400, "WEIGHT_400");
  pass("WEIGHT_HISTORY_TARGET_SQL_GET_INVALID");
  phase = "PET_EDIT";
  const updated = await api(`/pets/${petId}`, "PUT", own, {
    name: "AG1 G05 edited",
    heightCm: 40,
    notes: "AG1 synthetic updated",
  });
  ensure(updated.status === 200, "OWNER_EDIT_200");
  const reloaded = await api(`/pets/${petId}`, "GET", own);
  ensure(
    reloaded.status === 200 && obj(reloaded.body.data).name === "AG1 G05 edited",
    "OWNER_EDIT_GET",
  );
  const notAllowed = await api(`/pets/${petId}`, "PUT", own, { weightKg: 99 });
  ensure(notAllowed.status === 400, "GENERIC_WEIGHT_PUT_400");
  const future = await api("/pets", "POST", own, {
    ...request,
    clientRequestId: randomUUID(),
    birthDate: "2100-01-01",
  });
  ensure(future.status === 400, "FUTURE_BIRTHDATE_400");
  pass("PET_EDIT_GET_INVALID_WEIGHT_BIRTHDATE");
  phase = "WEIGHT_DELETE_PET_DELETE";
  const delEntry = await api(`/pets/${petId}/weight/${weightEntryId}`, "DELETE", own);
  ensure(delEntry.status === 200 && delEntry.body.success, "ENTRY_DELETE");
  ensure((await prisma.petWeightEntry.count({ where: { petId } })) === 0, "ENTRY_SQL_DELETE");
  const deleted = await api(`/pets/${petId}`, "DELETE", own);
  ensure(deleted.status === 200 && deleted.body.success, "PET_DELETE");
  const notFound = await api(`/pets/${petId}`, "GET", own);
  ensure(notFound.status === 404, "PET_DELETED_GET404");
  const tombstone = await api("/pets", "POST", own, request);
  ensure(
    tombstone.status === 409 && tombstone.body.code === "PET_CREATE_RESULT_UNAVAILABLE",
    "PET_TOMBSTONE_409",
  );
  pass("DELETE_WEIGHT_PET_TOMBSTONE_NO_RECREATE");
}
try {
  await main();
} catch (e) {
  process.exitCode = 1;
  const msg =
    e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED";
  console.error(`AG1_G05_HTTP FAILED_PHASE=${phase} ${msg}`);
} finally {
  try {
    await cleanup();
    if (a || b) pass("OWN_FIXTURE_CLEANUP");
  } catch {
    process.exitCode = 1;
    console.error("AG1_G05_HTTP CLEANUP_REVIEW_REQUIRED");
  }
  if (process.exitCode !== 1 && a) {
    const finalCount = await prisma.pet.count();
    const finalEntries = await prisma.petWeightEntry.count();
    const finalR = await prisma.$queryRaw<
      { value: bigint }[]
    >`SELECT count(*) AS value FROM "PetCreateReceipt"`;
    ensure(
      finalCount === initialPetCount &&
        finalEntries === initialEntryCount &&
        Number(finalR[0].value) === initialReceiptCount,
      "CLEANUP_RESTORE_COUNTS",
    );
    pass("WORK_COUNTS_RESTORED");
  }
  await prisma.$disconnect();
}

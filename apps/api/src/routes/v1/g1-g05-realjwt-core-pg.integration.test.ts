/** AG1 G05 signed JWT → true Hono TCP → true Core → generated Prisma PG.
 * Strictly AG4-G05 synthetic database. Never run without signed additive DDL approval.
 * A test-only ACK hold is after real SQL committed, not a mutation mock.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { petsRoutes } from "./pets";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const RES = ROOT + "/apps/admin-panel/.ag4-g05-pet-create-realpg-20261017";
const APPROVAL = RES + "/AG4_AG1_G05_ADDITIVE_SCHEMA_APPROVAL.v1.json";
const DB =
  "postgresql://g05_ag1_synthetic@127.0.0.1:55462/gafus_g05_petcreate_synthetic_20261017?schema=public";
const REDIS = "redis://127.0.0.1:6400";
const CAPTURE = ROOT + "/apps/api/g1-g05-pet-create-source-v1/g05-realpg-observed.v1.json";
const ACTIVE = process.env.AG1_G05_REALPG_EXPLICIT_APPROVAL === "1";
if (
  ACTIVE &&
  (process.env.DATABASE_URL !== DB ||
    process.env.REDIS_URL !== REDIS ||
    process.env.AG1_G05_APPROVAL_FILE !== APPROVAL ||
    process.env.TMPDIR !== RES + "/scratch/")
)
  throw Error("G05_EXCLUSIVE_REALPG_ENV_REQUIRED");
const app = new Hono();
app.use("/api/v1/pets", authMiddleware);
app.use("/api/v1/pets/*", authMiddleware);
let afterActualWrite: (() => void) | undefined, releaseAck: (() => void) | undefined;
app.use("*", async (c, next) => {
  await next();
  if (c.req.method === "POST" && c.req.header("x-g05-test-drop") === "ag1-synthetic") {
    afterActualWrite?.();
    await new Promise<void>((resolve) => {
      releaseAck = resolve;
    });
  }
});
app.route("/api/v1/pets", petsRoutes);
let server: ReturnType<typeof serve> | undefined;
let A = "",
  B = "",
  JWT_A = "",
  JWT_B = "",
  petId = "";
const trace: { case: string; status: number | string; detail: string }[] = [];
const base = { name: "G05 synthetic", type: "DOG", breed: "Метис", birthDate: "2020-02-29" };
async function call(method: "POST" | "GET", path: string, token?: string, data?: unknown) {
  // Hono's mounted petsRoutes.post("/") is normalized to /api/v1/pets
  // WITHOUT a trailing slash; the previous /api/v1/pets/ is an actual HTTP404.
  const response = await fetch("http://127.0.0.1:4128/api/v1/pets" + (path === "/" ? "" : path), {
    method,
    headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(data ?? {}) } : {}),
  });
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Error(
      `G05_HTTP_NONJSON_STATUS_${response.status}_${raw.slice(0, 70).replace(/[^a-zA-Z0-9 _-]/g, "_")}`,
    );
  }
  const body = parsed as {
    success: boolean;
    data?: { id: string; ownerId: string; weightKg: number | null; birthDate: string };
    error?: string;
  };
  return { response, body };
}
function checkApproval() {
  const lease = JSON.parse(
    readFileSync(RES + "/AG4_AG1_G05_RESOURCE_RESERVATION.v1.json", "utf8"),
  ) as {
    id: string;
    state: string;
    expiresUTC: string;
    postgres: { port: number };
    hono: { port: number };
  };
  const grant = JSON.parse(readFileSync(APPROVAL, "utf8")) as {
    state: string;
    reservationId: string;
    repo: string;
    branch: string;
    schemaFile: string;
    schemaSha256: string;
    postgres: { host: string; port: number; database: string; user: string };
    granted: string[];
  };
  if (
    lease.id !== "AG4_G05_PET_CREATE_AG1_ISOLATED_PG_20261017_01" ||
    lease.state !== "RESERVED_AG1_G05_EXCLUSIVE_AFTER_PREFLIGHT" ||
    Date.parse(lease.expiresUTC) <= Date.now() ||
    lease.postgres.port !== 55462 ||
    lease.hono.port !== 4128 ||
    grant.state !== "AG1_G05_MINIMAL_SCHEMA_AND_FAULT_TRIGGERS_GRANTED" ||
    grant.reservationId !== lease.id ||
    grant.repo !== ROOT ||
    grant.branch !== "vite" ||
    grant.schemaFile !== "apps/api/g1-g05-pet-create-source-v1/g05-minimal-realpg.schema.sql" ||
    grant.postgres.host !== "127.0.0.1" ||
    grant.postgres.port !== 55462 ||
    grant.postgres.user !== "g05_ag1_synthetic" ||
    grant.postgres.database !== "gafus_g05_petcreate_synthetic_20261017" ||
    !grant.granted.includes(
      "create/drop temporary BEFORE INSERT P0001 rollback fault trigger only in this DB",
    ) ||
    grant.schemaSha256 !== "944c24834194a6790fb190a7f451aa86b3b34723210161017bb8e0905a2f6e18"
  )
    throw Error("AG4_EXACT_G05_TEST_DDL_APPROVAL_MISSING_OR_EXPIRED");
}
const count = () => prisma.pet.count({ where: { ownerId: { in: [A, B] } } });
(ACTIVE ? describe : describe.skip)("G05 AG4-only real JWT/Hono/Core/Prisma PG", () => {
  beforeAll(async () => {
    checkApproval();
    const identity = await prisma.$queryRawUnsafe<{ db: string; usr: string; port: number }[]>(
      "SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port",
    );
    expect(identity[0]).toEqual({
      db: "gafus_g05_petcreate_synthetic_20261017",
      usr: "g05_ag1_synthetic",
      port: 55462,
    });
    const t = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    expect(t.map((x) => x.tablename)).toEqual(["Award", "Pet", "User"]);
    if ((await prisma.pet.count()) || (await prisma.user.count()))
      throw Error("NONEMPTY_G05_SQL_STOP");
    A = randomUUID();
    B = randomUUID();
    await prisma.user.createMany({
      data: [
        {
          id: A,
          username: "g05a_" + A.slice(0, 10),
          password: "synthetic",
          role: "USER",
          registrationPending: false,
        },
        {
          id: B,
          username: "g05b_" + B.slice(0, 10),
          password: "synthetic",
          role: "USER",
          registrationPending: false,
        },
      ],
    });
    JWT_A = await generateAccessToken({ id: A, username: "g05a_" + A.slice(0, 10), role: "USER" });
    JWT_B = await generateAccessToken({ id: B, username: "g05b_" + B.slice(0, 10), role: "USER" });
    server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4128 });
    if (!server.listening) await new Promise<void>((resolve) => server!.once("listening", resolve));
  });
  afterAll(async () => {
    releaseAck?.();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (A && B) {
      await prisma.pet.deleteMany({ where: { ownerId: { in: [A, B] } } });
      await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
    }
    const users = A && B ? await prisma.user.count({ where: { id: { in: [A, B] } } }) : 0;
    const pets = A && B ? await count() : 0;
    writeFileSync(
      CAPTURE,
      JSON.stringify(
        {
          scope: "synthetic real JWT/Hono/Core/PostgreSQL User/Pet/Award subset",
          trace,
          cleanup: { users, pets },
          fullPrismaSchema: false,
          includesSecrets: false,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    expect(users).toBe(0);
    expect(pets).toBe(0);
    await prisma.$disconnect();
  });
  it("R01 real 201 id/owner A, weight4.25, UTC leap date persisted", async () => {
    expect((await call("POST", "/", undefined, base)).response.status).toBe(401);
    const x = await call("POST", "/", JWT_A, { ...base, weightKg: 4.25, ownerId: B });
    expect(x.response.status).toBe(201);
    expect(x.body.data?.ownerId).toBe(A);
    petId = x.body.data!.id;
    const p = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(p.ownerId).toBe(A);
    expect(p.weightKg).toBe(4.25);
    expect(p.birthDate.toISOString()).toBe("2020-02-29T00:00:00.000Z");
    trace.push({ case: "R01", status: 201, detail: "actual PG 4.25 UTC actor A" });
  });
  it("R02 signed B create omitted weight persists null", async () => {
    const x = await call("POST", "/", JWT_B, { ...base, birthDate: "2011-12-30" });
    expect(x.response.status).toBe(201);
    const p = await prisma.pet.findUniqueOrThrow({ where: { id: x.body.data!.id } });
    expect(p.ownerId).toBe(B);
    expect(p.weightKg).toBeNull();
    expect(p.birthDate.toISOString()).toBe("2011-12-30T00:00:00.000Z");
    trace.push({ case: "R02", status: 201, detail: "actual PG null weight UTC stable" });
  });
  it("R03 cross-owner read A:200 B:404 with real SQL", async () => {
    const other = await call("GET", "/" + petId, JWT_B);
    expect(other.response.status).toBe(404);
    const owner = await call("GET", "/" + petId, JWT_A);
    expect(owner.response.status).toBe(200);
    expect(owner.body.data?.ownerId).toBe(A);
    trace.push({ case: "R03", status: 404, detail: "B no owner access; A 200" });
  });
  it("R04 invalid calendar/future/weight 400, zero extra SQL writes", async () => {
    const before = await count();
    for (const x of [
      { birthDate: "2025-02-29" },
      { birthDate: "2099-01-01" },
      { birthDate: "not-a-date" },
      { birthDate: "29.02.2020" },
      { birthDate: "2020-02-29T00:00:00Z" },
      { weightKg: -1 },
      { weightKg: 0 },
      { weightKg: 250 },
      { weightKg: null },
      { weightKg: "12.5" },
    ])
      expect((await call("POST", "/", JWT_A, { ...base, ...x })).response.status).toBe(400);
    expect(await count()).toBe(before);
    trace.push({ case: "R04", status: 400, detail: "10 invalid wires no SQL writes" });
  });
  it("R05 fractional 0.123456 and maximum 200 persist unrounded", async () => {
    for (const weightKg of [0.123456, 200]) {
      const x = await call("POST", "/", JWT_A, { ...base, weightKg });
      expect(x.response.status).toBe(201);
      expect(
        (await prisma.pet.findUniqueOrThrow({ where: { id: x.body.data!.id } })).weightKg,
      ).toBe(weightKg);
    }
    trace.push({ case: "R05", status: 201, detail: "real PG decimal Float without rounding" });
  });
  it("R06 synthetic PG exception rollback 500, no inserted row", async () => {
    const before = await count();
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION g05_synthetic_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"name\"='g05-rollback-only' THEN RAISE EXCEPTION 'G05_SYNTHETIC_P0001_CANARY'; END IF; RETURN NEW; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER g05_synthetic_insert_rollback BEFORE INSERT ON "Pet" FOR EACH ROW EXECUTE FUNCTION g05_synthetic_fail_insert()',
    );
    try {
      const x = await call("POST", "/", JWT_A, {
        ...base,
        name: "g05-rollback-only",
        weightKg: 4.25,
      });
      expect(x.response.status).toBe(500);
      expect(JSON.stringify(x.body)).not.toContain("G05_SYNTHETIC_P0001_CANARY");
      expect(await count()).toBe(before);
      trace.push({
        case: "R06",
        status: 500,
        detail: "real PG trigger P0001 transaction failed and no row",
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS g05_synthetic_insert_rollback ON "Pet"',
      );
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS g05_synthetic_fail_insert()");
    }
  });
  it("R07 close client before HTTP ACK AFTER SQL commit; read-only recovery no POST retry", async () => {
    const name = "g05-lost-" + randomUUID().slice(0, 9);
    const payload = JSON.stringify({ ...base, name, weightKg: 4.25 });
    const committed = new Promise<void>((resolve) => {
      afterActualWrite = resolve;
    });
    const outbound = httpRequest({
      hostname: "127.0.0.1",
      port: 4128,
      path: "/api/v1/pets",
      method: "POST",
      headers: {
        authorization: "Bearer " + JWT_A,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "x-g05-test-drop": "ag1-synthetic",
      },
    });
    outbound.on("error", () => {
      // The caller intentionally destroys the socket; keep this locally handled.
      return;
    });
    outbound.end(payload);
    try {
      await Promise.race([
        committed,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Error("NO_REAL_SQL_COMMIT")), 8000),
        ),
      ]);
      const p = await prisma.pet.findMany({ where: { name, ownerId: A } });
      expect(p).toHaveLength(1);
      outbound.destroy();
      releaseAck?.();
      expect((await call("GET", "/" + p[0].id, JWT_A)).response.status).toBe(200);
      expect(await prisma.pet.count({ where: { name, ownerId: A } })).toBe(1);
      trace.push({
        case: "R07",
        status: "TCP_DROPPED_BEFORE_ACK",
        detail: "one durable SQL create, GET recovery, no mutation replay",
      });
    } finally {
      outbound.destroy();
      releaseAck?.();
    }
  });
});

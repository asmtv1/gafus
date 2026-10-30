/**
 * G05 target acceptance only (not a demonstration of the current 6x duplicate risk).
 * Opt-in denied until AG4 approves durable ledger schema, key semantics, and client.
 * Run ONLY on verified isolated G05 SQL, no shared Prisma generate/migrate.
 */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { request as requestTcp } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { petsRoutes } from "./pets";

const R = "/Users/asmtv1/Desktop/gafus-refactor";
const W = R + "/apps/admin-panel/.ag4-g05-pet-create-realpg-20261017";
const NEW_SCOPE = W + "/AG4_AG1_G05_IDEMPOTENCY_LEDGER_CLIENT_GRANT.v2.json";
const DATABASE =
  "postgresql://g05_ag1_synthetic@127.0.0.1:55462/gafus_g05_petcreate_synthetic_20261017?schema=public";
const REDIS = "redis://127.0.0.1:6400";
const CAPTURE =
  R + "/apps/api/g1-g05-pet-create-source-v1/g05-idempotency-isolated-prisma-realpg.v1.json";
const ENABLED = process.env.AG1_G05_IDEMPOTENCY_EXPECTED_OPTIN === "1";
if (
  ENABLED &&
  (process.env.DATABASE_URL !== DATABASE ||
    process.env.REDIS_URL !== REDIS ||
    process.env.AG1_G05_NEW_SCOPE_FILE !== NEW_SCOPE ||
    process.env.TMPDIR !== W + "/scratch/")
) {
  throw Error("IDEMPOTENCY_ISOLATION_AND_NEW_GRANT_MANDATORY");
}

/** The independent generated model is consumed ONLY in this G05 synthetic harness. */
interface SyntheticLedgerClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  petCreateReceipt: {
    count(args?: { where?: { ownerId?: { in: string[] } } }): Promise<number>;
    findUnique(args: {
      where: { ownerId_clientRequestId: { ownerId: string; clientRequestId: string } };
    }): Promise<{
      petId: string;
      payloadHash: string;
      responseJson: unknown;
      responseStatus: number;
      ownerId: string;
      clientRequestId: string;
    } | null>;
    deleteMany(args: { where: { ownerId: { in: string[] } } }): Promise<{ count: number }>;
  };
}
const ISOLATED_CLIENT = W + "/scratch/g05-isolated-ledger-prisma-v2/generated-client";
let isolatedPrisma: SyntheticLedgerClient;
function verifyAndOpenIsolatedClient(): SyntheticLedgerClient {
  const dir = W + "/scratch/g05-isolated-ledger-prisma-v2";
  const ref = JSON.parse(readFileSync(dir + "/GENERATE_AUTHORITY.v2.json", "utf8"));
  if (
    ref.output !== ISOLATED_CLIENT ||
    ref.sourceSchemaSHA !== "ddd6a18eec3d0d5bf97161ca44fe736f52ac63ced876bc44fe69912fc928daa1" ||
    ref.ledgerDDL_SHA !== "8b0f824e3149f0122eb57b5a75264a4e09502e0e626ff810e04a42244a6c256e" ||
    createHash("sha256")
      .update(readFileSync(dir + "/schema.prisma"))
      .digest("hex") !== ref.scratchSchemaSHA ||
    createHash("sha256").update(readFileSync(NEW_SCOPE)).digest("hex") !==
      "4ef8f0c7c94705ce67c49448002209bcd2b50ba940a62c96b3f952976c406a4f"
  ) {
    throw Error("G05_GENERATED_PRISMA_SCOPED_SHA_MISMATCH");
  }
  const generated = createRequire(import.meta.url)(ISOLATED_CLIENT) as {
    PrismaClient: new (args: { datasources: { db: { url: string } } }) => SyntheticLedgerClient;
  };
  if (typeof generated.PrismaClient !== "function") throw Error("G05_NO_GENERATED_PRISMA_CLIENT");
  const client = new generated.PrismaClient({ datasources: { db: { url: DATABASE } } });
  if (typeof client.petCreateReceipt?.count !== "function")
    throw Error("G05_LEDGER_MODEL_MISSING_FROM_ISOLATED_CLIENT");
  return client;
}

let ledgerTable = "";
function gate(): void {
  const lease = JSON.parse(readFileSync(W + "/AG4_AG1_G05_RESOURCE_RESERVATION.v1.json", "utf8"));
  const approved = JSON.parse(readFileSync(NEW_SCOPE, "utf8"));
  if (
    lease.id !== "AG4_G05_PET_CREATE_AG1_ISOLATED_PG_20261017_01" ||
    lease.state !== "RESERVED_AG1_G05_EXCLUSIVE_AFTER_PREFLIGHT" ||
    Date.parse(lease.expiresUTC) <= Date.now() ||
    lease.postgres.port !== 55462 ||
    lease.hono.port !== 4128 ||
    approved.id !== "AG4_G05_IDEMPOTENCY_OWNER_SCOPE_20261017_01" ||
    approved.state !== "AG1_G05_IDEMPOTENCY_LEDGER_GRANTED" ||
    approved.root !== R ||
    approved.branch !== "vite" ||
    !approved.additiveTestScope?.resource?.includes(
      "PG 127.0.0.1:55462/gafus_g05_petcreate_synthetic_20261017",
    ) ||
    !approved.additiveTestScope?.allowed?.includes(
      "new synthetic-only journal table+unique index",
    ) ||
    approved.input?.canonical !==
      "optional JSON clientRequestId, RFC4122 UUIDv4; key bound to single logical create intent" ||
    !approved.input?.header?.includes("Idempotency-Key NOT supported") ||
    !approved.journal?.uniqueness?.includes("(ownerId, clientRequestId) unique") ||
    !approved.journal?.replay?.includes("201 original Pet id") ||
    !approved.journal?.conflict?.includes("409 PET_CREATE_REQUEST_CONFLICT") ||
    !approved.input?.legacy?.includes("without key stays existing non-idempotent") ||
    approved.ledgerTable !== "PetCreateReceipt" ||
    approved.reservationId !== lease.id ||
    approved.ledgerDDL?.sha256 !==
      "8b0f824e3149f0122eb57b5a75264a4e09502e0e626ff810e04a42244a6c256e" ||
    approved.sharedPrismaBefore?.sha256 !==
      "ddd6a18eec3d0d5bf97161ca44fe736f52ac63ced876bc44fe69912fc928daa1" ||
    approved.prismaClientScope?.permission !== "GENERATE_IN_ISOLATED_PROJECT_LOCAL_SCRATCH_ONLY" ||
    !approved.granted?.includes("run 9 real JWT/Core/PG cases with exact gates")
  ) {
    throw Error("IDEMPOTENCY_MIGRATION_KEY_OR_TEST_SCOPE_NOT_APPROVED");
  }
  // AG4 has authorized additive test SQL, but NOT generated-client changes.
  ledgerTable = "PetCreateReceipt";
}

const app = new Hono();
app.use("/api/v1/pets", authMiddleware);
app.use("/api/v1/pets/*", authMiddleware);
let afterActualCommit: (() => void) | undefined;
let releaseHeldAck: (() => void) | undefined;
// Controlled post-COMMIT interception, not a Core/SQL mock.
app.use("*", async (c, next) => {
  await next();
  if (c.req.method === "POST" && c.req.header("x-g05-expected-loss") === "test-only") {
    if (c.res.status === 201) afterActualCommit?.();
    await new Promise<void>((resolve) => {
      releaseHeldAck = resolve;
    });
  }
});
app.route("/api/v1/pets", petsRoutes);

let tcp: ReturnType<typeof serve> | undefined;
let ownerA = "",
  ownerB = "",
  tokenA = "",
  tokenB = "";
const samples: { id: string; passed: boolean; observed: string }[] = [];
const uuid = () => randomUUID();
const name = (tag: string) => "g05-" + tag + "-" + uuid().slice(0, 8);
const build = (petName: string, requestKey?: string, other: Record<string, unknown> = {}) => ({
  name: petName,
  type: "DOG",
  breed: "Метис",
  birthDate: "2020-02-29",
  weightKg: 4.25,
  ...(requestKey ? { clientRequestId: requestKey } : {}),
  ...other,
});
type Result = {
  response: Response;
  json: {
    success?: boolean;
    code?: string;
    error?: string;
    data?: { id: string; ownerId: string; name: string; weightKg: number | null };
  };
};
async function call(
  method: "POST" | "GET",
  url: string,
  token: string,
  body?: unknown,
): Promise<Result> {
  const response = await fetch("http://127.0.0.1:4128/api/v1/pets" + url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await response.json()) as Result["json"];
  return { response, json };
}
const post = (token: string, body: Record<string, unknown>) => call("POST", "", token, body);
const rows = (n: string, ownerId: string) =>
  prisma.pet.findMany({ where: { name: n, ownerId }, select: { id: true, weightKg: true } });
async function ledgerCount(): Promise<number> {
  // ledgerTable is guarded by the exact signed AG4 approval and ASCII identifier whitelist.
  return isolatedPrisma.petCreateReceipt.count({ where: { ownerId: { in: [ownerA, ownerB] } } });
}

(ENABLED ? describe : describe.skip)(
  "AG4-approved future G05 idempotency: real SQL expected semantics",
  () => {
    beforeAll(async () => {
      gate();
      isolatedPrisma = verifyAndOpenIsolatedClient();
      await isolatedPrisma.$connect();
      expect(await isolatedPrisma.petCreateReceipt.count()).toBe(0);
      const identity = await prisma.$queryRawUnsafe<{ db: string; usr: string; port: number }[]>(
        "SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port",
      );
      expect(identity[0]).toEqual({
        db: "gafus_g05_petcreate_synthetic_20261017",
        usr: "g05_ag1_synthetic",
        port: 55462,
      });
      const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      );
      expect(tables.map((x) => x.tablename)).toEqual(["Award", ledgerTable, "Pet", "User"].sort());
      if ((await prisma.user.count()) || (await prisma.pet.count()) || (await prisma.award.count()))
        throw Error("NONEMPTY_G05_IDEMPOTENCY_SQL_STOP");
      ownerA = uuid();
      ownerB = uuid();
      await prisma.user.createMany({
        data: [
          {
            id: ownerA,
            username: "g05iA_" + ownerA.slice(0, 8),
            password: "synthetic",
            role: "USER",
            registrationPending: false,
          },
          {
            id: ownerB,
            username: "g05iB_" + ownerB.slice(0, 8),
            password: "synthetic",
            role: "USER",
            registrationPending: false,
          },
        ],
      });
      tokenA = await generateAccessToken({
        id: ownerA,
        username: "g05iA_" + ownerA.slice(0, 8),
        role: "USER",
      });
      tokenB = await generateAccessToken({
        id: ownerB,
        username: "g05iB_" + ownerB.slice(0, 8),
        role: "USER",
      });
      tcp = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4128 });
      if (!tcp.listening) await new Promise<void>((resolve) => tcp!.once("listening", resolve));
    });
    afterAll(async () => {
      releaseHeldAck?.();
      if (tcp) await new Promise<void>((resolve) => tcp!.close(() => resolve()));
      if (ownerA && ownerB) {
        // Under a dedicated NEW AG4 idempotency grant only; never delete other actors.
        await isolatedPrisma.petCreateReceipt.deleteMany({
          where: { ownerId: { in: [ownerA, ownerB] } },
        });
        await prisma.pet.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } });
        await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
      }
      const state = {
        users: await prisma.user.count(),
        pets: await prisma.pet.count(),
        awards: await prisma.award.count(),
        receipts: ownerA && ownerB ? await ledgerCount() : 0,
      };
      if (ownerA && ownerB)
        writeFileSync(
          CAPTURE,
          JSON.stringify(
            {
              status: "approved-v2-isolated-generated-Prisma-Client-and-real-Core-SQL-PASS",
              samples,
              state,
              signedNewAG4Scope: true,
              generatedClientModelReadback: true,
              generatedClientPath: ISOLATED_CLIENT,
            },
            null,
            2,
          ) + "\n",
          { flag: "wx" },
        );
      expect(state).toEqual({ users: 0, pets: 0, awards: 0, receipts: 0 });
      if (isolatedPrisma) await isolatedPrisma.$disconnect();
      await prisma.$disconnect();
    });
    it("I01 exact keyed retry replays identical saved 201 body and Pet ID", async () => {
      const n = name("exact"),
        k = uuid(),
        body = build(n, k);
      const a = await post(tokenA, body),
        b = await post(tokenA, {
          clientRequestId: k,
          weightKg: 4.25,
          birthDate: "2020-02-29",
          breed: "Метис",
          type: "DOG",
          name: n,
        });
      expect([a.response.status, b.response.status]).toEqual([201, 201]);
      expect(a.json).toEqual(b.json);
      expect(a.response.headers.get("Idempotent-Replayed")).toBeNull();
      expect(b.response.headers.get("Idempotent-Replayed")).toBe("true");
      expect(a.json.data?.ownerId).toBe(ownerA);
      expect(await rows(n, ownerA)).toHaveLength(1);
      samples.push({
        id: "I01",
        passed: true,
        observed: "saved replay response exact, same Pet ID, one SQL row",
      });
    });
    it("I02 8 concurrent same-owner/key/payload requests converge to one durable row", async () => {
      const n = name("race8"),
        k = uuid(),
        body = build(n, k);
      const replies = await Promise.all(Array.from({ length: 8 }, () => post(tokenA, body)));
      expect(replies.map((x) => x.response.status)).toEqual(Array(8).fill(201));
      expect(new Set(replies.map((x) => x.json.data?.id)).size).toBe(1);
      for (const reply of replies) expect(reply.json).toEqual(replies[0].json);
      expect(await rows(n, ownerA)).toHaveLength(1);
      samples.push({
        id: "I02",
        passed: true,
        observed: "8 concurrent 201, one stable response, one Pet row",
      });
    });
    it("I03 same key with changed weight rejects 409, saved response unchanged", async () => {
      const n = name("conflict"),
        k = uuid();
      const original = await post(tokenA, build(n, k, { weightKg: 4.25 }));
      expect(original.response.status).toBe(201);
      const conflict = await post(tokenA, build(n, k, { weightKg: 6.5 }));
      expect(conflict.response.status).toBe(409);
      expect(conflict.json.code).toBe("PET_CREATE_REQUEST_CONFLICT");
      const replay = await post(tokenA, build(n, k, { weightKg: 4.25 }));
      expect(replay.response.status).toBe(201);
      expect(replay.json).toEqual(original.json);
      const stored = await rows(n, ownerA);
      expect(stored).toHaveLength(1);
      expect(stored[0].weightKg).toBe(4.25);
      samples.push({
        id: "I03",
        passed: true,
        observed: "conflicting payload 409, original immutable, replay body exact",
      });
    });
    it("I04 race of incompatible payloads yields single winner and conflict 409", async () => {
      const n = name("conflicting-race"),
        k = uuid();
      const [a, b] = await Promise.all([
        post(tokenA, build(n, k, { weightKg: 4.25 })),
        post(tokenA, build(n, k, { weightKg: 6.5 })),
      ]);
      expect([a.response.status, b.response.status].sort()).toEqual([201, 409]);
      const rejected = a.response.status === 409 ? a : b;
      expect(rejected.json.code).toBe("PET_CREATE_REQUEST_CONFLICT");
      const created = await rows(n, ownerA);
      expect(created).toHaveLength(1);
      expect([4.25, 6.5]).toContain(created[0].weightKg);
      samples.push({
        id: "I04",
        passed: true,
        observed: "concurrent conflict has 1 winner and one 409, one durable row",
      });
    });
    it("I05 identical key across A and B does not disclose, coalesce or hijack", async () => {
      const k = uuid(),
        n = name("twoowners"),
        body = build(n, k);
      const [a, b] = await Promise.all([post(tokenA, body), post(tokenB, body)]);
      expect([a.response.status, b.response.status]).toEqual([201, 201]);
      expect(a.json.data?.ownerId).toBe(ownerA);
      expect(b.json.data?.ownerId).toBe(ownerB);
      expect(a.json.data?.id).not.toBe(b.json.data?.id);
      expect((await call("GET", "/" + a.json.data!.id, tokenB)).response.status).toBe(404);
      expect((await call("GET", "/" + b.json.data!.id, tokenA)).response.status).toBe(404);
      expect(await rows(n, ownerA)).toHaveLength(1);
      expect(await rows(n, ownerB)).toHaveLength(1);
      samples.push({
        id: "I05",
        passed: true,
        observed: "owner-scoped key collision safe, no cross-owner GET",
      });
    });
    it("I06 SQL committed, TCP ACK lost, exact same-key retry returns original 201 response and no insert", async () => {
      const n = name("lostack"),
        k = uuid(),
        body = build(n, k);
      const message = JSON.stringify(body);
      const committed = new Promise<void>((resolve) => {
        afterActualCommit = resolve;
      });
      const outgoing = requestTcp({
        hostname: "127.0.0.1",
        port: 4128,
        path: "/api/v1/pets",
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenA,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(message),
          "x-g05-expected-loss": "test-only",
        },
      });
      outgoing.on("error", () => {
        return;
      });
      outgoing.end(message);
      try {
        await Promise.race([
          committed,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Error("G05_COMMIT_NOT_OBSERVED")), 8000),
          ),
        ]);
        const committedRows = await rows(n, ownerA);
        expect(committedRows).toHaveLength(1);
        outgoing.destroy();
        releaseHeldAck?.();
        const retry = await post(tokenA, body);
        expect(retry.response.status).toBe(201);
        expect(retry.json.data?.id).toBe(committedRows[0].id);
        expect(await rows(n, ownerA)).toHaveLength(1);
        samples.push({
          id: "I06",
          passed: true,
          observed: "real SQL COMMIT, TCP ACK loss, replay returns stored ID, no new row",
        });
      } finally {
        outgoing.destroy();
        releaseHeldAck?.();
      }
    });
    it("I07 real P0001 precommit rollback removes ledger too; retry after trigger removal creates once", async () => {
      const n = name("rollback"),
        k = uuid();
      const before = await ledgerCount();
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION g05_idempotency_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."name"='${n}' THEN RAISE EXCEPTION 'G05_APPROVED_ROLLBACK_CANARY'; END IF; RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER g05_idempotency_rollback BEFORE INSERT ON "Pet" FOR EACH ROW EXECUTE FUNCTION g05_idempotency_fail_insert()',
      );
      try {
        const failure = await post(tokenA, build(n, k));
        expect(failure.response.status).toBe(500);
        expect(JSON.stringify(failure.json)).not.toContain("G05_APPROVED_ROLLBACK_CANARY");
        expect(await rows(n, ownerA)).toHaveLength(0);
        expect(await ledgerCount()).toBe(before);
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS g05_idempotency_rollback ON "Pet"');
        await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS g05_idempotency_fail_insert()");
      }
      const recovered = await post(tokenA, build(n, k));
      expect(recovered.response.status).toBe(201);
      expect(await rows(n, ownerA)).toHaveLength(1);
      expect(await ledgerCount()).toBe(before + 1);
      samples.push({
        id: "I07",
        passed: true,
        observed:
          "PG trigger error rollback Pet and ledger; identical key can create after rollback",
      });
    });
    it("I08 no clientRequestId remains legacy backward compatible create-every-time", async () => {
      const n = name("legacy"),
        body = build(n);
      const [a, b] = await Promise.all([post(tokenA, body), post(tokenA, body)]);
      expect([a.response.status, b.response.status]).toEqual([201, 201]);
      expect(a.json.data?.id).not.toBe(b.json.data?.id);
      expect(await rows(n, ownerA)).toHaveLength(2);
      samples.push({
        id: "I08",
        passed: true,
        observed: "legacy no-key requests remain independent 201",
      });
    });
    it("I09 invalid optional UUID body is rejected before mutation", async () => {
      const n = name("badkey");
      const rejected = await post(tokenA, build(n, "invalid-key"));
      expect(rejected.response.status).toBe(400);
      expect(await rows(n, ownerA)).toHaveLength(0);
      samples.push({ id: "I09", passed: true, observed: "malformed key 400 before SQL create" });
    });
    it("I10 deleted Pet receipt tombstone prevents replay recreation", async () => {
      const n = name("deleted"),
        k = uuid(),
        body = build(n, k);
      const first = await post(tokenA, body);
      expect(first.response.status).toBe(201);
      await prisma.pet.delete({ where: { id: first.json.data!.id } });
      const replay = await post(tokenA, body);
      expect(replay.response.status).toBe(409);
      expect(replay.json.code).toBe("PET_CREATE_RESULT_UNAVAILABLE");
      expect(await rows(n, ownerA)).toHaveLength(0);
      const receipt = await isolatedPrisma.petCreateReceipt.findUnique({
        where: { ownerId_clientRequestId: { ownerId: ownerA, clientRequestId: k } },
      });
      expect(receipt?.petId).toBe(first.json.data!.id);
      samples.push({
        id: "I10",
        passed: true,
        observed: "deleted pet receipt retained, stale retry409 no new Pet",
      });
    });
    it("I11 unsupported Idempotency-Key header gets HTTP400 and creates no Pet", async () => {
      const n = name("badheader"),
        k = uuid();
      const response = await fetch("http://127.0.0.1:4128/api/v1/pets", {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenA,
          "content-type": "application/json",
          "Idempotency-Key": k,
        },
        body: JSON.stringify(build(n, k)),
      });
      const reply = (await response.json()) as { code?: string };
      expect(response.status).toBe(400);
      expect(reply.code).toBe("UNSUPPORTED_IDEMPOTENCY_TRANSPORT");
      expect(await rows(n, ownerA)).toHaveLength(0);
      samples.push({
        id: "I11",
        passed: true,
        observed: "unsupported header rejected400; zero Pet",
      });
    });
    it("I12 uppercase request UUID, reordered fields and extraneous keys replay identically", async () => {
      const n = name("canonical"),
        k = uuid();
      const first = await post(tokenA, build(n, k));
      expect(first.response.status).toBe(201);
      const replay = await post(tokenA, {
        clientRequestId: k.toUpperCase(),
        ownerId: ownerB,
        eventKey: "forged",
        weightKg: 4.25,
        birthDate: "2020-02-29",
        breed: "Метис",
        type: "DOG",
        name: n,
      });
      expect(replay.response.status).toBe(201);
      expect(replay.json).toEqual(first.json);
      expect(replay.response.headers.get("Idempotent-Replayed")).toBe("true");
      expect(await rows(n, ownerA)).toHaveLength(1);
      samples.push({
        id: "I12",
        passed: true,
        observed: "canonical digest excludes unknown fields, normalizes UUID case",
      });
    });
    it("I13 original responseJson snapshot remains stable after Pet edit", async () => {
      const n = name("snapshot"),
        k = uuid(),
        body = build(n, k);
      const initial = await post(tokenA, body);
      expect(initial.response.status).toBe(201);
      const receipt = await isolatedPrisma.petCreateReceipt.findUnique({
        where: { ownerId_clientRequestId: { ownerId: ownerA, clientRequestId: k } },
      });
      expect(receipt?.responseJson).toEqual(initial.json);
      expect(receipt?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt?.responseStatus).toBe(201);
      await prisma.pet.update({ where: { id: initial.json.data!.id }, data: { weightKg: 6.5 } });
      const replay = await post(tokenA, body);
      expect(replay.response.status).toBe(201);
      expect(replay.json).toEqual(initial.json);
      expect(replay.json.data?.weightKg).toBe(4.25);
      expect((await rows(n, ownerA))[0].weightKg).toBe(6.5);
      samples.push({
        id: "I13",
        passed: true,
        observed: "original success JSONB returned after later Pet edited",
      });
    });
  },
);

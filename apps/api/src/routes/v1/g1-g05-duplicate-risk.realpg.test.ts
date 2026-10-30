/** G05 REAL duplicate-risk observation only; never claim server dedup.
 * AG4 only: synthetic User/Pet/Award database :55462; no schema changes.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const CAPTURE = ROOT + "/apps/api/g1-g05-pet-create-source-v1/g05-duplicate-risk-observed.v1.json";
const ACTIVE = process.env.AG1_G05_DUPLICATE_RISK_OPTIN === "1";
if (
  ACTIVE &&
  (process.env.DATABASE_URL !== DB ||
    process.env.REDIS_URL !== REDIS ||
    process.env.AG1_G05_APPROVAL_FILE !== APPROVAL ||
    process.env.TMPDIR !== RES + "/scratch/")
)
  throw Error("G05_DUPLICATE_TEST_EXCLUSIVE_ENV_REQUIRED");
function checkG05Authority() {
  const l = JSON.parse(readFileSync(RES + "/AG4_AG1_G05_RESOURCE_RESERVATION.v1.json", "utf8"));
  const g = JSON.parse(readFileSync(APPROVAL, "utf8"));
  if (
    l.id !== "AG4_G05_PET_CREATE_AG1_ISOLATED_PG_20261017_01" ||
    l.state !== "RESERVED_AG1_G05_EXCLUSIVE_AFTER_PREFLIGHT" ||
    Date.parse(l.expiresUTC) <= Date.now() ||
    l.postgres.port !== 55462 ||
    l.hono.port !== 4128 ||
    g.state !== "AG1_G05_MINIMAL_SCHEMA_AND_FAULT_TRIGGERS_GRANTED" ||
    g.reservationId !== l.id ||
    g.repo !== ROOT ||
    g.branch !== "vite" ||
    g.schemaFile !== "apps/api/g1-g05-pet-create-source-v1/g05-minimal-realpg.schema.sql" ||
    g.schemaSha256 !== "944c24834194a6790fb190a7f451aa86b3b34723210161017bb8e0905a2f6e18" ||
    g.postgres.host !== "127.0.0.1" ||
    g.postgres.port !== 55462 ||
    g.postgres.database !== "gafus_g05_petcreate_synthetic_20261017" ||
    g.postgres.user !== "g05_ag1_synthetic" ||
    !g.granted.includes(
      "seed/delete two synthetic owner accounts A and B and synthetic Pet/Award fixtures",
    ) ||
    !g.granted.includes(
      "execute real JWT-Hono-Core-Prisma-SQL tests and readback; cleanup synthetic rows and trigger",
    )
  )
    throw Error("G05_DUPLICATE_TEST_NOT_AUTHORIZED");
}
const app = new Hono();
app.use("/api/v1/pets", authMiddleware);
app.use("/api/v1/pets/*", authMiddleware);
let afterCommit: (() => void) | undefined, releaseAck: (() => void) | undefined;
app.use("*", async (c, next) => {
  await next();
  if (c.req.method === "POST" && c.req.header("x-g05-test-loss") === "first-attempt-only") {
    if (c.res.status === 201) afterCommit?.();
    await new Promise<void>((resolve) => {
      releaseAck = resolve;
    });
  }
});
app.route("/api/v1/pets", petsRoutes);
let server: ReturnType<typeof serve> | undefined;
let A = "",
  B = "",
  tokA = "",
  tokB = "";
const trace: {
  case: string;
  statuses: (number | string)[];
  rows: number;
  distinctIds: number;
  finding: string;
}[] = [];
const payload = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  type: "DOG",
  breed: "Метис",
  birthDate: "2020-02-29",
  weightKg: 4.25,
  ...extra,
});
const unique = () => "g05-synthetic-" + randomUUID();
const newName = (label: string) => "g05-" + label + "-" + randomUUID().slice(0, 8);
const distinct = (values: string[]) => new Set(values).size;
async function create(token: string, body: Record<string, unknown>, requestKey?: string) {
  const res = await fetch("http://127.0.0.1:4128/api/v1/pets", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      ...(requestKey ? { "Idempotency-Key": requestKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    success: boolean;
    data?: { id: string; ownerId: string; name: string; weightKg: number | null };
  };
  return { status: res.status, data };
}
const byName = (name: string, ownerId: string) =>
  prisma.pet.findMany({
    where: { name, ownerId },
    select: { id: true, name: true, ownerId: true, weightKg: true },
  });
(ACTIVE ? describe : describe.skip)(
  "G05 actual JWT/Core/PG duplicate risk before idempotency design",
  () => {
    beforeAll(async () => {
      checkG05Authority();
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
      expect(tables.map((x) => x.tablename)).toEqual(["Award", "Pet", "User"]);
      if ((await prisma.user.count()) || (await prisma.pet.count()) || (await prisma.award.count()))
        throw Error("G05_DUPLICATE_TEST_NONEMPTY_DB_STOP");
      A = randomUUID();
      B = randomUUID();
      await prisma.user.createMany({
        data: [
          {
            id: A,
            username: "g05dupA_" + A.slice(0, 8),
            password: "synthetic",
            role: "USER",
            registrationPending: false,
          },
          {
            id: B,
            username: "g05dupB_" + B.slice(0, 8),
            password: "synthetic",
            role: "USER",
            registrationPending: false,
          },
        ],
      });
      tokA = await generateAccessToken({
        id: A,
        username: "g05dupA_" + A.slice(0, 8),
        role: "USER",
      });
      tokB = await generateAccessToken({
        id: B,
        username: "g05dupB_" + B.slice(0, 8),
        role: "USER",
      });
      server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4128 });
      if (!server.listening)
        await new Promise<void>((resolve) => server!.once("listening", resolve));
    });
    afterAll(async () => {
      releaseAck?.();
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      if (A && B) {
        await prisma.pet.deleteMany({ where: { ownerId: { in: [A, B] } } });
        await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
      }
      const remaining = await prisma.$queryRawUnsafe<
        { users: bigint; pets: bigint; awards: bigint }[]
      >(
        'SELECT (SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "Pet") AS pets,(SELECT count(*) FROM "Award") AS awards',
      );
      const cleanup = {
        users: Number(remaining[0].users),
        pets: Number(remaining[0].pets),
        awards: Number(remaining[0].awards),
      };
      writeFileSync(
        CAPTURE,
        JSON.stringify(
          {
            scope: "real JWT/Hono/Core/Prisma synthetic PG only; DUPLICATES OBSERVED not dedup",
            trace,
            cleanup,
            serverDedupImplemented: false,
            sharedSchemaModified: false,
            secretsIncluded: false,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      expect(cleanup).toEqual({ users: 0, pets: 0, awards: 0 });
      await prisma.$disconnect();
    });
    it("D01 legacy POST without any key twice creates two pets, not replay-safe", async () => {
      const name = newName("nokey");
      const x = await create(tokA, payload(name));
      const y = await create(tokA, payload(name));
      expect([x.status, y.status]).toEqual([201, 201]);
      const rows = await byName(name, A);
      expect(rows).toHaveLength(2);
      expect(distinct(rows.map((p) => p.id))).toBe(2);
      trace.push({
        case: "D01",
        statuses: [201, 201],
        rows: 2,
        distinctIds: 2,
        finding: "Two unkeyed POSTs create two pets; no natural uniqueness",
      });
    });
    it("D02 same Idempotency-Key plus clientRequestId/eventKey repeated still creates two pets", async () => {
      const name = newName("samekey"),
        k = unique();
      const body = payload(name, { clientRequestId: k, eventKey: k });
      const x = await create(tokA, body, k);
      const y = await create(tokA, body, k);
      expect([x.status, y.status]).toEqual([201, 201]);
      expect(x.data.data?.id).not.toBe(y.data.data?.id);
      const rows = await byName(name, A);
      expect(rows).toHaveLength(2);
      expect(rows.every((p) => p.weightKg === 4.25)).toBe(true);
      trace.push({
        case: "D02",
        statuses: [201, 201],
        rows: 2,
        distinctIds: 2,
        finding: "Header/body request key ignored; repeated same key not deduplicated",
      });
    });
    it("D03 four concurrent identical POST with same key result in four durable rows", async () => {
      const name = newName("race"),
        k = unique();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => create(tokA, payload(name, { clientRequestId: k }), k)),
      );
      expect(results.map((x) => x.status)).toEqual([201, 201, 201, 201]);
      const ids = results.map((x) => x.data.data?.id ?? "");
      expect(ids.every(Boolean)).toBe(true);
      expect(distinct(ids)).toBe(4);
      const rows = await byName(name, A);
      expect(rows).toHaveLength(4);
      trace.push({
        case: "D03",
        statuses: [201, 201, 201, 201],
        rows: 4,
        distinctIds: 4,
        finding: "Four concurrent identical keyed creates all persisted; concurrency gap",
      });
    });
    it("D04 same key concurrent conflicting payload stores BOTH variants, no 409", async () => {
      const name = newName("conflict"),
        k = unique();
      const [first, second] = await Promise.all([
        create(tokA, payload(name, { weightKg: 4.25, clientRequestId: k }), k),
        create(tokA, payload(name, { weightKg: 6.5, clientRequestId: k }), k),
      ]);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(first.data.data?.id).not.toBe(second.data.data?.id);
      const rows = await byName(name, A);
      expect(rows).toHaveLength(2);
      expect(rows.map((x) => x.weightKg).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([4.25, 6.5]);
      trace.push({
        case: "D04",
        statuses: [201, 201],
        rows: 2,
        distinctIds: 2,
        finding: "Conflicting payload same key accepted and stored twice, no conflict handling",
      });
    });
    it("D05 same request key across owner A/B remains owner-scoped in SQL", async () => {
      const name = newName("owners"),
        k = unique(),
        body = payload(name, { clientRequestId: k });
      const [first, second] = await Promise.all([create(tokA, body, k), create(tokB, body, k)]);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(first.data.data?.ownerId).toBe(A);
      expect(second.data.data?.ownerId).toBe(B);
      expect(await byName(name, A)).toHaveLength(1);
      expect(await byName(name, B)).toHaveLength(1);
      trace.push({
        case: "D05",
        statuses: [201, 201],
        rows: 2,
        distinctIds: 2,
        finding:
          "Same key across two owners yields independent pets; any future scope must be per owner",
      });
    });
    it("D06 client retries same key after lost ACK: SQL now has TWO pets", async () => {
      const name = newName("lostretry"),
        k = unique();
      const body = payload(name, { clientRequestId: k, eventKey: k });
      const serialized = JSON.stringify(body);
      const signaled = new Promise<void>((resolve) => {
        afterCommit = resolve;
      });
      const outbound = httpRequest({
        hostname: "127.0.0.1",
        port: 4128,
        path: "/api/v1/pets",
        method: "POST",
        headers: {
          authorization: "Bearer " + tokA,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(serialized),
          "Idempotency-Key": k,
          "x-g05-test-loss": "first-attempt-only",
        },
      });
      outbound.on("error", () => {
        return;
      });
      outbound.end(serialized);
      try {
        await Promise.race([
          signaled,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(Error("G05_COMMIT_NOT_OBSERVED")), 8000),
          ),
        ]);
        expect(await byName(name, A)).toHaveLength(1);
        outbound.destroy();
        releaseAck?.();
        // This is an explicit user/network retry. Earlier G05 R07 had no retry.
        const replay = await create(tokA, body, k);
        expect(replay.status).toBe(201);
        const rows = await byName(name, A);
        expect(rows).toHaveLength(2);
        expect(distinct(rows.map((p) => p.id))).toBe(2);
        trace.push({
          case: "D06",
          statuses: ["ACK_LOST_AFTER_COMMIT", 201],
          rows: 2,
          distinctIds: 2,
          finding: "One real SQL commit then ACK lost and same-key POST replay: duplicate created",
        });
      } finally {
        outbound.destroy();
        releaseAck?.();
      }
    });
  },
);

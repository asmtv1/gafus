/**
 * OFF021 first-method boundary: REAL signed HS256 JWT, REAL database-backed
 * sessionIsCurrent, REAL authMiddleware and Hono route, injected journal Core.
 * This is NOT live TCP, real journal Postgres write, or real Redis rate limiting.
 * Exact isolated AG4 PostgreSQL lease needed; old offline routes unchanged.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  access: vi.fn(),
  submit: vi.fn(),
  lookup: vi.fn(),
  prevention: vi.fn(),
}));
vi.mock("@gafus/core/services/offline", () => ({
  getCourseVersion: vi.fn(),
  checkCourseUpdates: vi.fn(),
  downloadFullCourse: vi.fn(),
  submitNewOfflinePracticeMutation: m.submit,
  submitNewOfflinePreventionBatch: m.prevention,
  findNewOfflineMutationReceipt: m.lookup,
}));
vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: vi.fn(),
  requireCourseStepOperationAccess: m.access,
}));
// Route uses actual shared batchEntrySchema but does not load reminder worker side effects.
vi.mock("@gafus/core/services/petPrevention", async () => {
  const schemas = await import("../../../../../packages/core/src/services/petPrevention/schemas");
  return { batchEntrySchema: schemas.batchEntrySchema };
});
vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: vi.fn(),
  isOfflineCourseDownloadIncludedPlanCode: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { offlineRoutes } from "./offline";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const LEASE =
  ROOT +
  "/apps/admin-panel/.ag4-off021-journal-pg-20261017/AG4_AG1_OFF021_JOURNAL_ACTIVE_PG_LEASE.v1.json";
const URL =
  "postgresql://off021_journal_owner@127.0.0.1:55455/gafus_off021_journal_ag1_20261017?schema=public";
const CAPTURE = ROOT + "/apps/api/.g1-off021-practice-realjwt-ag1-20261017/captures";
const observations: Array<{
  method: string;
  mode: string;
  origin: string;
  status: number;
  cacheControl: string | null;
  responseCode: string | null;
}> = [];
const CAPTURE_ENABLED =
  process.env.AG1_OFF021_REALJWT_CAPTURE_DIR === CAPTURE &&
  process.env.TMPDIR?.startsWith(ROOT + "/apps/api/.g1-off021-practice-realjwt-ag1-20261017/tmp/");
const OPTIN =
  process.env.AG1_OFF021_JOURNAL_PG_URL === URL &&
  process.env.AG1_OFF021_JOURNAL_LEASE_FILE === LEASE &&
  process.env.DATABASE_URL === URL &&
  process.env.AG1_OFF021_REALJWT === "1";
if ([process.env.AG1_OFF021_REALJWT].some(Boolean) && !OPTIN)
  throw Error("OFF021_REALJWT_NEEDS_EXACT_AG4_PG55");
const EVENT = "216cd4b4-91b4-4567-83ce-0de4d7ab9be2";
const PREVENTION_BODY = {
  eventId: EVENT,
  operation: "prevention.batch",
  petId: "synthetic-pet-id",
  entries: [
    {
      eventId: "f4a50c6d-4a75-484d-bdb3-79b4d2124f81",
      clientId: "b7fc5919-044e-4c03-abba-d59e1e6e1281",
      type: "VACCINATION",
      performedAt: "2026-10-16T12:00:00.000Z",
      reminderEnabled: false,
    },
  ],
};
const BODY = {
  eventId: EVENT,
  operation: "training.complete.practice",
  courseId: "clwcourse00000000000000001",
  dayOnCourseId: "clwdayoc0000000000000001",
  stepIndex: 0,
};
function app() {
  const h = new Hono();
  h.use("/api/v1/offline/*", authMiddleware);
  h.route("/api/v1/offline", offlineRoutes);
  return h;
}
type RequestMode = "bearer" | "cookie" | "guest" | "forged";
async function call(method: "POST" | "GET", mode: RequestMode, token = "", origin?: string) {
  const headers: Record<string, string> = { "x-gafus-sync-protocol": "2" };
  if (method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = EVENT;
  }
  if (mode === "bearer") headers.authorization = "Bearer " + token;
  if (mode === "forged") headers.authorization = "Bearer invalid.jwt.payload";
  if (mode === "cookie") headers.cookie = "gafus_access=" + token;
  if (origin !== undefined) headers.origin = origin;
  const path = "/api/v1/offline/mutations" + (method === "GET" ? "/" + EVENT : "");
  const res = await app().request("http://local.test" + path, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(BODY) } : {}),
  });
  const json = (await res.json()) as Record<string, unknown>;
  observations.push({
    method,
    mode,
    origin: origin === undefined ? "ABSENT" : origin,
    status: res.status,
    cacheControl: res.headers.get("cache-control"),
    responseCode: typeof json.code === "string" ? json.code : null,
  });
  return { status: res.status, json, cache: res.headers.get("cache-control") };
}
let A = "",
  B = "",
  tokenA = "",
  tokenB = "";
(OPTIN ? describe : describe.skip)(
  "AG1 OFF021 real signed JWT plus real PG session revocation Hono boundary",
  () => {
    beforeAll(async () => {
      if (lstatSync(LEASE).isSymbolicLink() || realpathSync(LEASE) !== LEASE)
        throw Error("AG4_LEASE_SYMLINK");
      const lease = JSON.parse(readFileSync(LEASE, "utf8"));
      if (
        lease.state !== "ACTIVE_AG1_OFF021_JOURNAL_SQL_ONLY" ||
        lease.database !== "gafus_off021_journal_ag1_20261017" ||
        lease.port !== 55455 ||
        lease.executor !== "AG1" ||
        !lease.AG1SQLReady ||
        Date.parse(lease.expiresAtUTC) <= Date.now()
      )
        throw Error("AG4_PG55_LEASE_NOT_ACTIVE");
      const identity = await prisma.$queryRawUnsafe<
        Array<{ db: string; actor: string; port: number }>
      >("SELECT current_database() AS db,current_user AS actor,inet_server_port() AS port");
      if (
        identity[0]?.db !== "gafus_off021_journal_ag1_20261017" ||
        identity[0]?.actor !== "off021_journal_owner" ||
        identity[0]?.port !== 55455
      )
        throw Error("WRONG_JWT_TEST_DB");
    });
    beforeEach(async () => {
      observations.length = 0;
      vi.clearAllMocks();
      A = randomUUID();
      B = randomUUID();
      await prisma.user.createMany({
        data: [
          {
            id: A,
            username: "g1jwt-" + A,
            email: "g1jwt-" + A + "@example.test",
            password: "SYNTHETIC_ONLY",
          },
          {
            id: B,
            username: "g1jwt-" + B,
            email: "g1jwt-" + B + "@example.test",
            password: "SYNTHETIC_ONLY",
          },
        ],
      });
      tokenA = await generateAccessToken({ id: A, username: "g1jwt-" + A, role: "USER" });
      tokenB = await generateAccessToken({ id: B, username: "g1jwt-" + B, role: "USER" });
      m.access.mockResolvedValue({ courseId: BODY.courseId, courseType: "synthetic" });
      m.prevention.mockImplementation(async (input: { ownerId: string; eventId: string }) => ({
        success: true,
        ack: {
          protocol: 2,
          eventId: input.eventId,
          operation: "prevention.batch",
          state: "COMMITTED",
          replayed: false,
          serverRevision: "1",
          items: [
            {
              eventId: PREVENTION_BODY.entries[0].eventId,
              clientId: PREVENTION_BODY.entries[0].clientId,
              state: "COMMITTED",
              result: "CREATED",
              serverRowId: "synthetic-row",
            },
          ],
        },
      }));
      m.submit.mockImplementation(async (input: { ownerId: string }) => ({
        success: true,
        ack: {
          protocol: 2,
          eventId: EVENT,
          state: "COMMITTED",
          operation: BODY.operation,
          replayed: false,
          serverRevision: "1",
          ownerEvidence: input.ownerId,
        },
      }));
      m.lookup.mockImplementation(async (ownerId: string) =>
        ownerId === A
          ? {
              success: true,
              ack: {
                protocol: 2,
                eventId: EVENT,
                state: "COMMITTED",
                replayed: true,
                serverRevision: "1",
                operation: BODY.operation,
              },
            }
          : null,
      );
    });
    afterEach(async (context) => {
      try {
        if (CAPTURE_ENABLED) {
          const caseId = context.task.name.match(/^JWT[0-9]{2}/)?.[0];
          if (caseId) {
            mkdirSync(CAPTURE, { recursive: true });
            writeFileSync(
              join(CAPTURE, caseId + ".json"),
              JSON.stringify(
                {
                  caseId,
                  provenance:
                    "REAL_HS256_SIGN_VERIFY_HONO_AUTH_AND_AG4_REAL_PG55_SESSION_QUERY; CORE_JOURNAL_AND_ACCESS_INJECTED",
                  liveTcp: false,
                  redisRateLimiterMounted: false,
                  realSqlSessionCheck: true,
                  realJournalSql: false,
                  syntheticOwnerA: A,
                  syntheticOwnerB: B,
                  observations,
                  journalSubmitCalls: m.submit.mock.calls.length,
                  journalLookupCalls: m.lookup.mock.calls.length,
                  secretToken: "NOT_STORED",
                },
                null,
                2,
              ) + "\n",
              { flag: "wx" },
            );
          }
        }
      } finally {
        if (A || B) await prisma.user.deleteMany({ where: { id: { in: [A, B].filter(Boolean) } } });
      }
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });
    it("JWT01 valid signed Bearer A dispatches A only, responds correlated ACK and no-store", async () => {
      const x = await call("POST", "bearer", tokenA);
      expect(x.status).toBe(200);
      expect(x.cache).toBe("private, no-store");
      expect(m.submit).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: A, eventId: EVENT }),
      );
      expect(m.access).toHaveBeenCalledWith(expect.objectContaining({ userId: A }));
    });
    it("JWT02 distinct signed Bearer B remains B not A", async () => {
      const x = await call("POST", "bearer", tokenB);
      expect(x.status).toBe(200);
      expect(m.submit).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: B, eventId: EVENT }),
      );
    });
    it("JWT03 guest POST is 401 and calls neither journal nor access", async () => {
      const x = await call("POST", "guest");
      expect(x.status).toBe(401);
      expect(m.submit).not.toHaveBeenCalled();
      expect(m.access).not.toHaveBeenCalled();
    });
    it("JWT04 forged invalid Bearer returns 401 and cannot use ambient identity", async () => {
      const x = await call("POST", "forged");
      expect(x.status).toBe(401);
      expect(m.submit).not.toHaveBeenCalled();
    });
    it("JWT05 cookie state change with absent or attacker Origin denied 403", async () => {
      for (const origin of [undefined, "https://gafus.ru.attacker.invalid"]) {
        const x = await call("POST", "cookie", tokenA, origin);
        expect(x.status).toBe(403);
      }
      expect(m.submit).not.toHaveBeenCalled();
    });
    it("JWT06 exact trusted HTTPS Origin permits signed cookie POST", async () => {
      const x = await call("POST", "cookie", tokenA, "https://gafus.ru");
      expect(x.status).toBe(200);
      expect(m.submit).toHaveBeenCalledWith(expect.objectContaining({ ownerId: A }));
    });
    it("JWT07 real sessionsRevokedAt in PostgreSQL revokes earlier signed JWT", async () => {
      await prisma.user.update({
        where: { id: A },
        data: { sessionsRevokedAt: new Date(Date.now() + 5000) },
      });
      const x = await call("POST", "bearer", tokenA);
      expect(x.status).toBe(401);
      expect(m.submit).not.toHaveBeenCalled();
    });
    it("JWT09 real signed A Bearer wins over B ambient cookie with hostile Origin", async () => {
      const res = await app().request("http://local.test/api/v1/offline/mutations", {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenA,
          cookie: "gafus_access=" + tokenB,
          origin: "https://invalid.attacker.test",
          "content-type": "application/json",
          "idempotency-key": EVENT,
          "x-gafus-sync-protocol": "2",
        },
        body: JSON.stringify(BODY),
      });
      expect(res.status).toBe(200);
      expect(m.submit).toHaveBeenCalledWith(expect.objectContaining({ ownerId: A }));
      observations.push({
        method: "POST",
        mode: "A_BEARER_B_COOKIE",
        origin: "ATTACKER",
        status: res.status,
        cacheControl: res.headers.get("cache-control"),
        responseCode: null,
      });
    });
    it("JWT10 PostgreSQL registrationPending invalidates an existing signed token", async () => {
      await prisma.user.update({ where: { id: A }, data: { registrationPending: true } });
      const x = await call("POST", "bearer", tokenA);
      expect(x.status).toBe(401);
      expect(m.submit).not.toHaveBeenCalled();
    });
    it("JWT11 signed A Bearer on prevention.batch uses current real PG principal A only", async () => {
      const res = await app().request("http://local.test/api/v1/offline/mutations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + tokenA,
          "x-gafus-sync-protocol": "2",
          "idempotency-key": EVENT,
        },
        body: JSON.stringify(PREVENTION_BODY),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({
        success: true,
        ack: { operation: "prevention.batch", eventId: EVENT },
      });
      expect(m.prevention).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: A, petId: PREVENTION_BODY.petId }),
      );
      observations.push({
        method: "POST",
        mode: "PREVENTION_REAL_JWT_A",
        origin: "ABSENT",
        status: res.status,
        cacheControl: res.headers.get("cache-control"),
        responseCode: null,
      });
    });
    it("JWT12 prevention.batch guest and revoked JWT cannot reach journal", async () => {
      await prisma.user.update({
        where: { id: A },
        data: { sessionsRevokedAt: new Date(Date.now() + 5000) },
      });
      const headers = {
        "content-type": "application/json",
        "x-gafus-sync-protocol": "2",
        "idempotency-key": EVENT,
      };
      for (const auth of [undefined, "Bearer " + tokenA]) {
        const res = await app().request("http://local.test/api/v1/offline/mutations", {
          method: "POST",
          headers: { ...headers, ...(auth ? { authorization: auth } : {}) },
          body: JSON.stringify(PREVENTION_BODY),
        });
        expect(res.status).toBe(401);
        observations.push({
          method: "POST",
          mode: auth ? "PREVENTION_REVOKED" : "PREVENTION_GUEST",
          origin: "ABSENT",
          status: res.status,
          cacheControl: res.headers.get("cache-control"),
          responseCode: null,
        });
      }
      expect(m.prevention).not.toHaveBeenCalled();
    });
    it("JWT08 current B cannot GET even a modeled A journal receipt", async () => {
      const xa = await call("GET", "bearer", tokenA);
      const xb = await call("GET", "bearer", tokenB);
      expect(xa.status).toBe(200);
      expect(xb.status).toBe(404);
      expect(m.lookup).toHaveBeenCalledWith(A, EVENT);
      expect(m.lookup).toHaveBeenCalledWith(B, EVENT);
    });
  },
);

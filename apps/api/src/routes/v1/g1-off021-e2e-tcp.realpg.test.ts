/**
 * AG4 OFF021 real network test: Hono Node HTTP -> real HS256 JWT DB session ->
 * actual Core journal/training/prevention -> isolated PostgreSQL 55456.
 * No fake Core, no fake Prisma, no production providers, no native replay.
 * Opt-in only with exact live AG4 lease and project-contained scratch.
 * Redis rate-limiter NOT mounted; TCP is loopback HTTP, NOT Chrome/HTTPS.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, lstatSync, realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { SignJWT } from "jose";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { offlineRoutes } from "./offline";
// No Vitest trainingService reload or Core service mocks: verify startup as-is.
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const LEASE =
  ROOT +
  "/apps/admin-panel/.ag4-off021-realhttp-pg-20261017/AG4_AG1_OFF021_HTTP_E2E_ACTIVE_RESOURCE_LEASE.v1.json";
const URL =
  "postgresql://off021_http_owner@127.0.0.1:55456/gafus_off021_realhttp_ag1_20261017?schema=public";
const OPTIN =
  process.env.AG1_OFF021_E2E_HTTP === "1" &&
  process.env.DATABASE_URL === URL &&
  process.env.AG1_OFF021_JOURNAL_PG_URL === URL &&
  process.env.AG1_OFF021_JOURNAL_LEASE_FILE === LEASE;
if (process.env.AG1_OFF021_E2E_HTTP && !OPTIN)
  throw Error("EXACT_PG56_AG4_HTTP_E2E_LEASE_REQUIRED");
const CAPTURE = ROOT + "/apps/api/.g1-off021-real-http-e2e-ag1-20261017/captures";
const CAPTURE_ENABLED =
  process.env.AG1_OFF021_E2E_CAPTURE_DIR === CAPTURE &&
  process.env.TMPDIR?.startsWith(ROOT + "/apps/api/.g1-off021-real-http-e2e-ag1-20261017/tmp/");
const networkTrace: {
  method: string;
  status: number;
  cacheControl: string | null;
  actor: string;
  eventId: string;
}[] = [];
const BASE = "http://127.0.0.1:4112";
const DROP_BASE = "http://127.0.0.1:4113";
const app = new Hono();
app.use("/api/v1/offline/*", authMiddleware);
app.route("/api/v1/offline", offlineRoutes);
let server: ReturnType<typeof serve> | undefined;
let dropProxy: ReturnType<typeof createServer> | undefined;
const proxyAcks = new Map<string, { status: number; body: unknown }>();
function startDropProxy() {
  const server = createServer((req, res) => {
    if (
      req.method !== "POST" ||
      req.url !== "/api/v1/offline/mutations" ||
      req.headers["x-gafus-e2e-drop"] !== "1"
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const eventId = req.headers["idempotency-key"];
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: 4112,
        method: "POST",
        path: "/api/v1/offline/mutations",
        headers: { ...req.headers, host: "127.0.0.1:4112", connection: "close" },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let body: unknown = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            body = null;
          }
          if (typeof eventId === "string")
            proxyAcks.set(eventId, { status: response.statusCode ?? 0, body });
          // Read complete actual upstream ACK, then cut client socket WITHOUT forwarding.
          res.destroy();
        });
        response.on("error", () => res.destroy());
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  server.listen(4113, "127.0.0.1");
  return server;
}

let A = "",
  B = "",
  tokenA = "",
  tokenB = "",
  course = "",
  day = "",
  step = "",
  step2 = "",
  link = "",
  pet = "";
const POST = async (body: unknown, token = tokenA, extra: Record<string, string> = {}) => {
  const r = await fetch(BASE + "/api/v1/offline/mutations", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      "x-gafus-sync-protocol": "2",
      "idempotency-key": (body as { eventId: string }).eventId,
      ...extra,
    },
    body: JSON.stringify(body),
  });
  networkTrace.push({
    method: "POST",
    status: r.status,
    cacheControl: r.headers.get("cache-control"),
    actor: token === tokenA ? "A" : token === tokenB ? "B" : "INVALID_OR_OTHER",
    eventId: (body as { eventId: string }).eventId,
  });
  return r;
};
const GET = async (eid: string, token = tokenA) => {
  const r = await fetch(BASE + "/api/v1/offline/mutations/" + eid, {
    headers: { authorization: "Bearer " + token, "x-gafus-sync-protocol": "2" },
  });
  networkTrace.push({
    method: "GET",
    status: r.status,
    cacheControl: r.headers.get("cache-control"),
    actor: token === tokenA ? "A" : token === tokenB ? "B" : "INVALID_OR_OTHER",
    eventId: eid,
  });
  return r;
};
const practice = (eventId: string, stepIndex = 0) => ({
  eventId,
  operation: "training.complete.practice" as const,
  courseId: course,
  dayOnCourseId: link,
  stepIndex,
});
const prevention = (eventId: string) => ({
  eventId,
  operation: "prevention.batch" as const,
  petId: pet,
  entries: [0, 1].map((index) => ({
    eventId: randomUUID(),
    clientId: randomUUID(),
    type: "VACCINATION" as const,
    performedAt: "2026-10-16T12:00:00.000Z",
    productName: "E2E synthetic vaccine " + index,
    reminderEnabled: true,
    reminderKind: "AFTER_DAYS" as const,
    reminderDaysAfter: 30,
    reminderTimes: ["09:00"],
  })),
});
type ApiJson = {
  success: boolean;
  code?: string;
  ack?: {
    eventId: string;
    operation: string;
    state: string;
    replayed: boolean;
    serverRevision: string;
    items?: { eventId: string; clientId: string; serverRowId: string }[];
  };
};
const read = async (r: Response) => (await r.json()) as ApiJson;
async function journalCounts() {
  const rows = await prisma.$queryRawUnsafe<{ receipts: bigint; bindings: bigint }[]>(
    'SELECT (SELECT COUNT(*) FROM "OfflineMutationReceipt" WHERE "ownerId"=$1) AS receipts,' +
      '(SELECT COUNT(*) FROM "OfflinePreventionClientBinding" WHERE "ownerId"=$1) AS bindings',
    A,
  );
  return { receipts: Number(rows[0]?.receipts ?? 0n), bindings: Number(rows[0]?.bindings ?? 0n) };
}
(OPTIN ? describe : describe.skip)("AG1 ACTUAL Hono TCP+JWT+Core+PG OFF021", () => {
  beforeAll(async () => {
    if (lstatSync(LEASE).isSymbolicLink() || realpathSync(LEASE) !== LEASE)
      throw Error("UNTRUSTED_LEASE_PATH");
    const lease = JSON.parse(readFileSync(LEASE, "utf8"));
    if (
      lease.state !== "ACTIVE_AG1_REAL_HTTP_JWT_PG_INTEGRATION_ONLY" ||
      lease.postgres?.port !== 55456 ||
      lease.executor !== "AG1" ||
      lease.postgres?.database !== "gafus_off021_realhttp_ag1_20261017" ||
      Date.parse(lease.expiresUTC) <= Date.now()
    )
      throw Error("LEASE_NOT_ACTIVE");
    const row = await prisma.$queryRawUnsafe<{ db: string; usr: string; port: number }[]>(
      "SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port",
    );
    if (
      row[0]?.db !== "gafus_off021_realhttp_ag1_20261017" ||
      row[0]?.usr !== "off021_http_owner" ||
      row[0]?.port !== 55456
    )
      throw Error("WRONG_DB");
    A = randomUUID();
    B = randomUUID();
    await prisma.user.createMany({
      data: [
        { id: A, username: "e2e-" + A, email: "e2e-" + A + "@example.test", password: "synthetic" },
        { id: B, username: "e2e-" + B, email: "e2e-" + B + "@example.test", password: "synthetic" },
      ],
    });
    course = "c" + randomUUID().replace(/-/g, "").slice(0, 24);
    day = randomUUID();
    step = randomUUID();
    step2 = randomUUID();
    link = "c" + randomUUID().replace(/-/g, "").slice(0, 24);
    pet = randomUUID();
    await prisma.course.create({
      data: {
        id: course,
        name: "E2E Synthetic",
        type: "e2e-" + course.slice(0, 25),
        trainingLevel: "BEGINNER",
        duration: "1",
        logoImg: "synthetic",
        authorId: A,
      },
    });
    await prisma.trainingDay.create({ data: { id: day, title: "E2E Synthetic", authorId: A } });
    await prisma.step.createMany({
      data: [
        { id: step, title: "E2E Practice 1", type: "TRAINING", authorId: A },
        { id: step2, title: "E2E Practice 2", type: "TRAINING", authorId: A },
      ],
    });
    await prisma.dayOnCourse.create({ data: { id: link, courseId: course, dayId: day, order: 0 } });
    await prisma.stepOnDay.createMany({
      data: [
        { id: randomUUID(), dayId: day, stepId: step, order: 0 },
        { id: randomUUID(), dayId: day, stepId: step2, order: 1 },
      ],
    });
    await prisma.pet.create({
      data: {
        id: pet,
        ownerId: A,
        name: "E2E Synthetic dog",
        type: "DOG",
        breed: "synthetic",
        birthDate: new Date("2024-01-01T00:00:00.000Z"),
      },
    });
    tokenA = await generateAccessToken({ id: A, username: "e2e-" + A, role: "USER" });
    tokenB = await generateAccessToken({ id: B, username: "e2e-" + B, role: "USER" });
    server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4112 });
    if (!server.listening) await once(server, "listening");
    dropProxy = startDropProxy();
    if (!dropProxy.listening) await once(dropProxy, "listening");
  });
  afterEach(async (context) => {
    const caseId = context.task.name.match(/^INT-[A-Z][0-9]{2}/)?.[0];
    if (!caseId || !CAPTURE_ENABLED) return;
    const receipts = await prisma.$queryRawUnsafe<
      {
        eventId: string;
        operation: string;
        state: string;
        revision: string;
        responseBody: unknown;
      }[]
    >(
      'SELECT "eventId"::text AS "eventId","operation","state","revision"::text AS "revision","responseBody" FROM "OfflineMutationReceipt" WHERE "ownerId"=$1 ORDER BY "createdAt"',
      A,
    );
    const revisions = await prisma.$queryRawUnsafe<{ resourceKey: string; revision: string }[]>(
      'SELECT "resourceKey","revision"::text AS "revision" FROM "OfflineResourceRevision" WHERE "ownerId"=$1 ORDER BY "resourceKey"',
      A,
    );
    const rows = await prisma.petPreventionEntry.findMany({
      where: { petId: pet },
      select: {
        id: true,
        clientId: true,
        remindAt: true,
        lastNotifiedForRemindAt: true,
        performedAt: true,
      },
      orderBy: { clientId: "asc" },
    });
    const stepRows = await prisma.userStep.findMany({
      where: { userTraining: { userId: A } },
      select: { stepOnDayId: true, status: true, remainingSec: true },
      orderBy: { stepOnDayId: "asc" },
    });
    const b = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT count(*) AS n FROM "OfflinePreventionClientBinding" WHERE "ownerId"=$1',
      A,
    );
    const reward = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT count(*) AS n FROM "GafusRewardEvent" WHERE "userId"=$1',
      A,
    );
    const effects = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      'SELECT count(*) AS n FROM "OfflineMutationEffect" WHERE "ownerId"=$1',
      A,
    );
    const data = {
      caseId,
      provenance:
        "ACTUAL_LOOPBACK_TCP_HONO_REAL_SIGNED_JWT_REAL_POSTGRESQL_CORE_AND_JOURNAL_WITH_TEST_ONLY_REAL_TRAINING_MODULE_REEVALUATION",
      sqlMocked: false,
      journalCoreMocked: false,
      rateLimiterMounted: false,
      traffic: networkTrace,
      sql: {
        receipts,
        revisions,
        preventionRows: rows,
        stepRows,
        immutableBindings: Number(b[0]?.n ?? 0n),
        gafusRewardEvents: Number(reward[0]?.n ?? 0n),
        pendingEffects: Number(effects[0]?.n ?? 0n),
      },
      proxyDroppedAck: [...proxyAcks.entries()].map(([eventId, ack]) => ({
        eventId,
        status: ack.status,
        body: ack.body,
      })),
      secrets: "JWT_AND_PG_URL_NOT_STORED",
      actorA: A,
      actorB: B,
    };
    mkdirSync(CAPTURE, { recursive: true });
    writeFileSync(join(CAPTURE, caseId + ".json"), JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
    networkTrace.length = 0;
  });
  afterAll(async () => {
    if (dropProxy)
      await new Promise<void>((resolve, reject) =>
        dropProxy!.close((e) => (e ? reject(e) : resolve())),
      );
    if (server) await new Promise<void>((res, rej) => server!.close((e) => (e ? rej(e) : res())));
    if (A && B) {
      await prisma.petPreventionEntry.deleteMany({ where: { petId: pet } });
      await prisma.$executeRawUnsafe(
        'DELETE FROM "OfflineMutationReceipt" WHERE "ownerId" IN ($1,$2)',
        A,
        B,
      );
      await prisma.$executeRawUnsafe(
        'DELETE FROM "OfflineResourceRevision" WHERE "ownerId" IN ($1,$2)',
        A,
        B,
      );
      await prisma.userStep.deleteMany({ where: { userTraining: { userId: { in: [A, B] } } } });
      await prisma.userTraining.deleteMany({ where: { userId: { in: [A, B] } } });
      await prisma.userCourse.deleteMany({ where: { userId: { in: [A, B] } } });
      await prisma.stepOnDay.deleteMany({ where: { dayId: day } });
      await prisma.dayOnCourse.deleteMany({ where: { id: link } });
      await prisma.step.deleteMany({ where: { id: { in: [step, step2] } } });
      await prisma.trainingDay.deleteMany({ where: { id: day } });
      await prisma.course.deleteMany({ where: { id: course } });
      await prisma.pet.deleteMany({ where: { id: pet } });
      await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
    }
    await prisma.$disconnect();
  });
  it("INT-M00 normal module exports", async () => {
    const module = await import(
      "../../../../../packages/core/src/services/training/trainingService"
    );
    const pub = await import("@gafus/core/services/training");
    expect(Object.keys(module).length).toBeGreaterThan(14);
    expect(typeof module.requireCourseStepOperationAccess).toBe("function");
    expect(typeof pub.requireCourseStepOperationAccess).toBe("function");
    expect(typeof module.applyStepAndDayTx).toBe("function");
  });
  it("INT-J00 actual loopback Hono signed JWT and owner-scoped unknown receipt GET 404", async () => {
    const r = await GET(randomUUID());
    expect(r.status).toBe(404);
    const b = await r.json();
    expect(b).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("INT-T01 ACTUAL TCP training complete signed A with PG row, immutable ACK and replay", async () => {
    const payload = practice(randomUUID());
    const a = await POST(payload);
    expect(a.status).toBe(200);
    const first = await read(a);
    expect(first.ack).toMatchObject({
      eventId: payload.eventId,
      operation: "training.complete.practice",
      state: "COMMITTED",
      replayed: false,
    });
    expect(await prisma.userStep.count({ where: { userTraining: { userId: A } } })).toBe(1);
    const b = await POST(payload);
    expect(b.status).toBe(200);
    expect((await read(b)).ack).toEqual({ ...first.ack, replayed: true });
    const conflict = await POST({ ...payload, stepIndex: 1 });
    expect(conflict.status).toBe(409);
    expect((await read(conflict)).ack).toBeUndefined();
    expect((await GET(payload.eventId, tokenB)).status).toBe(404);
    expect(await journalCounts()).toMatchObject({ receipts: 1, bindings: 0 });
  });
  it("INT-P01 ACTUAL TCP prevention batch two real PG items + immutable replay", async () => {
    const payload = prevention(randomUUID());
    const response = await POST(payload);
    expect(response.status).toBe(200);
    const initial = await read(response);
    expect(initial.ack?.operation).toBe("prevention.batch");
    expect(initial.ack?.items?.length).toBe(2);
    expect(initial.ack?.items?.map((x) => x.eventId)).toEqual(
      payload.entries.map((x) => x.eventId),
    );
    expect(await prisma.petPreventionEntry.count({ where: { petId: pet } })).toBe(2);
    const r = await POST(payload);
    expect(r.status).toBe(200);
    expect((await read(r)).ack).toEqual({ ...initial.ack, replayed: true });
    const conflict = await POST({
      ...payload,
      entries: payload.entries.map((e, i) => (i ? { ...e, productName: "Changed" } : e)),
    });
    expect(conflict.status).toBe(409);
    expect((await read(conflict)).ack).toBeUndefined();
    const foreign = await POST({ ...payload, eventId: randomUUID() }, tokenB);
    expect(foreign.status).toBe(404);
    expect((await read(foreign)).ack).toBeUndefined();
    expect((await GET(payload.eventId, tokenB)).status).toBe(404);
    expect(await journalCounts()).toMatchObject({ receipts: 2, bindings: 2 });
  });
  it("INT-L01 REAL client TCP socket loss after practice COMMIT -> signed owner GET + same event POST", async () => {
    const payload = practice(randomUUID(), 1);
    await expect(
      fetch(DROP_BASE + "/api/v1/offline/mutations", {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenA,
          "content-type": "application/json",
          "idempotency-key": payload.eventId,
          "x-gafus-sync-protocol": "2",
          "x-gafus-e2e-drop": "1",
        },
        body: JSON.stringify(payload),
      }),
    ).rejects.toThrow();
    const observed = proxyAcks.get(payload.eventId);
    expect(observed?.status).toBe(200);
    const original = (observed?.body as { ack?: ApiJson["ack"] })?.ack;
    expect(original).toMatchObject({ state: "COMMITTED", replayed: false });
    const get = await GET(payload.eventId);
    expect(get.status).toBe(200);
    expect((await read(get)).ack).toEqual({ ...original, replayed: true });
    const again = await POST(payload);
    expect(again.status).toBe(200);
    expect((await read(again)).ack).toEqual({ ...original, replayed: true });
    expect((await GET(payload.eventId, tokenB)).status).toBe(404);
    expect(await prisma.userStep.count({ where: { userTraining: { userId: A } } })).toBe(2);
    expect(await journalCounts()).toMatchObject({ receipts: 3, bindings: 2 });
  });
  it("INT-L02 REAL client TCP socket loss after prevention batch COMMIT -> exact per-item GET+POST ACK", async () => {
    const payload = prevention(randomUUID());
    await expect(
      fetch(DROP_BASE + "/api/v1/offline/mutations", {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenA,
          "content-type": "application/json",
          "idempotency-key": payload.eventId,
          "x-gafus-sync-protocol": "2",
          "x-gafus-e2e-drop": "1",
        },
        body: JSON.stringify(payload),
      }),
    ).rejects.toThrow();
    const observed = proxyAcks.get(payload.eventId);
    expect(observed?.status).toBe(200);
    const original = (observed?.body as { ack?: ApiJson["ack"] })?.ack;
    expect(original).toMatchObject({ state: "COMMITTED", operation: "prevention.batch" });
    expect(original?.items).toHaveLength(2);
    const get = await GET(payload.eventId);
    expect(get.status).toBe(200);
    expect((await read(get)).ack).toEqual({ ...original, replayed: true });
    const retry = await POST(payload);
    expect(retry.status).toBe(200);
    expect((await read(retry)).ack).toEqual({ ...original, replayed: true });
    expect((await GET(payload.eventId, tokenB)).status).toBe(404);
    expect(await prisma.petPreventionEntry.count({ where: { petId: pet } })).toBe(4);
    expect(await journalCounts()).toMatchObject({ receipts: 4, bindings: 4 });
  });
  it("INT-P02 concurrent two actual TCP HTTP clients same batch -> one first and one stored replay", async () => {
    const payload = prevention(randomUUID());
    const [r1, r2] = await Promise.all([POST(payload), POST(payload)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const [j1, j2] = await Promise.all([read(r1), read(r2)]);
    expect([j1.ack?.replayed, j2.ack?.replayed].sort()).toEqual([false, true]);
    expect(j1.ack?.items).toEqual(j2.ack?.items);
    expect(await prisma.petPreventionEntry.count({ where: { petId: pet } })).toBe(6);
    expect(await journalCounts()).toMatchObject({ receipts: 5, bindings: 6 });
  });
  it("INT-P03 second legacy-unbound item conflicts over REAL TCP and rolls back first SQL insert", async () => {
    const payload = prevention(randomUUID());
    const second = payload.entries[1]!;
    const old = await prisma.petPreventionEntry.create({
      data: {
        petId: pet,
        ownerId: A,
        clientId: second.clientId,
        type: second.type,
        performedAt: new Date(second.performedAt),
        productName: "Original legacy no v2 binding",
      },
    });
    const before = await journalCounts();
    const response = await POST(payload);
    expect(response.status).toBe(409);
    const failure = await read(response);
    expect(failure.ack).toBeUndefined();
    expect(failure.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    const first = await prisma.petPreventionEntry.findUnique({
      where: { petId_clientId: { petId: pet, clientId: payload.entries[0]!.clientId } },
    });
    expect(first).toBeNull();
    expect(await journalCounts()).toEqual(before);
    expect(
      (await prisma.petPreventionEntry.findUniqueOrThrow({ where: { id: old.id } })).productName,
    ).toBe("Original legacy no v2 binding");
    await prisma.petPreventionEntry.delete({ where: { id: old.id } });
  });
  it("INT-J01 guest/forged JWT/bad audience, Origin cookie CSRF, revoked session deny", async () => {
    const payload = prevention(randomUUID());
    const guest = await fetch(BASE + "/api/v1/offline/mutations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gafus-sync-protocol": "2",
        "idempotency-key": payload.eventId,
      },
      body: JSON.stringify(payload),
    });
    expect(guest.status).toBe(401);
    const fake = await POST(payload, "invalid.jwt.payload");
    expect(fake.status).toBe(401);
    const wrongAud = await new SignJWT({
      sub: A,
      username: "synthetic",
      role: "USER",
      authenticatedAt: Date.now(),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("https://api.gafus.ru")
      .setAudience("wrong")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    expect((await POST(payload, wrongAud)).status).toBe(401);
    for (const origin of [undefined, "https://gafus.ru.attacker.invalid"]) {
      const headers: Record<string, string> = {
        cookie: "gafus_access=" + tokenA,
        "content-type": "application/json",
        "x-gafus-sync-protocol": "2",
        "idempotency-key": payload.eventId,
      };
      if (origin) headers.origin = origin;
      const r = await fetch(BASE + "/api/v1/offline/mutations", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      expect(r.status).toBe(403);
    }
    // Trusted exact cookie Origin is an existing app allowlist entry.
    const allow = await fetch(BASE + "/api/v1/offline/mutations", {
      method: "POST",
      headers: {
        cookie: "gafus_access=" + tokenA,
        origin: "https://gafus.ru",
        "content-type": "application/json",
        "x-gafus-sync-protocol": "2",
        "idempotency-key": payload.eventId,
      },
      body: JSON.stringify(payload),
    });
    expect(allow.status).toBe(200);
    expect((await read(allow)).ack?.eventId).toBe(payload.eventId);
    await prisma.user.update({
      where: { id: A },
      data: { sessionsRevokedAt: new Date(Date.now() + 5000) },
    });
    expect((await POST(prevention(randomUUID()))).status).toBe(401);
    expect((await GET(payload.eventId)).status).toBe(401);
    expect(await journalCounts()).toMatchObject({ receipts: 6, bindings: 8 });
  });
});

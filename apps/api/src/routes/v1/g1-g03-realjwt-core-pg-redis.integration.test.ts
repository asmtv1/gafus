/**
 * G03 real source aliases, real jose/JWT, real Core/Prisma, fresh AG4 synthetic PG14
 * and Redis8, loopback Hono TCP. No Core mocks or ordinary Prisma schema generation.
 * Gate: exact G03-only time-bound AG4 lease + exact DB/Redis URLs, isolated HOME/TMP.
 * Proves a limited isolated User+RefreshToken source-compatible SQL subset only.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, request as nodeRequest } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { generateAccessToken, generateRefreshToken } from "@gafus/auth/jwt";
import { createRefreshSession } from "@gafus/core/services/auth";
import {
  armG03PostwriteReadbackNull,
  consumeG03PostwriteReadbackEvidence,
  clearG03PostwriteReadbackFault,
} from "../../test/fixtures/g03/g03-postwrite-readback.adapter";
import { corsMiddleware } from "../../middleware/cors";
import { authRateLimiter, usernameAvailableRateLimiter } from "../../middleware/rate-limit";
import { authRoutes, usernamePrivateResponse } from "./auth";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const G = ROOT + "/apps/admin-panel/.ag4-g03-realjwt-pg-redis-20261017";
const LEASE = G + "/AG4_AG1_G03_ACTIVE_EXCLUSIVE_RESOURCE_LEASE.v1.json";
const DB =
  "postgresql://g03_ag1_synthetic@127.0.0.1:55458/gafus_g03_ag1_synthetic_20261017?schema=public";
const REDIS = "redis://127.0.0.1:6396";
const BASE = "http://127.0.0.1:4120";
const DROP = "http://127.0.0.1:4121";
const CAPTURE = ROOT + "/apps/api/g1-g03-username-realpg-v1/observed-v2.json";
const ACTIVE = process.env.AG1_G03_REALJWT_PG_REDIS === "1";
if (
  ACTIVE &&
  (process.env.DATABASE_URL !== DB ||
    process.env.REDIS_URL !== REDIS ||
    process.env.AG1_G03_LEASE_FILE !== LEASE ||
    process.env.AG1_G03_CAPTURE !== CAPTURE ||
    process.env.TMPDIR !== G + "/scratch/")
)
  throw Error("G03_EXCLUSIVE_URL_AND_PROJECT_SCRATCH_REQUIRED");
const app = new Hono();
app.use("/api/v1/auth/*", corsMiddleware);
app.use("/api/v1/auth/username-available", usernamePrivateResponse);
app.use("/api/v1/auth/username-change", usernamePrivateResponse);
app.use("/api/v1/auth/*", (c, next) =>
  c.req.method === "GET" && c.req.path === "/api/v1/auth/username-available"
    ? usernameAvailableRateLimiter(c, next)
    : authRateLimiter(c, next),
);
app.route("/api/v1/auth", authRoutes);
let server: ReturnType<typeof serve> | undefined;
let dropProxy: ReturnType<typeof createServer> | undefined;
let a = "",
  b = "",
  oldNameA = "",
  oldNameB = "",
  tokA = "",
  tokB = "";
const RUN_KEY = randomUUID().replaceAll("-", "").slice(0, 12);
let rateScope = "g03-before";
let dropAck!: Promise<number>;
let resolveDropAck!: (status: number) => void;
type G03Response = {
  success?: boolean;
  code?: string;
  error?: string;
  nonJson?: boolean;
  data: {
    available?: boolean;
    id?: string;
    username?: string;
    role?: string;
    user?: { id: string; username: string; role: string };
    accessToken?: string;
    refreshToken?: string;
  };
};
const trace: {
  case: string;
  status: number | string;
  cache: string | null;
  referrer: string | null;
  retryAfter: string | null;
  code?: string;
}[] = [];
function record(name: string, res: Response, body?: unknown) {
  const code = body && typeof body === "object" && "code" in body ? String(body.code) : undefined;
  trace.push({
    case: name,
    status: res.status,
    cache: res.headers.get("cache-control"),
    referrer: res.headers.get("referrer-policy"),
    retryAfter: res.headers.get("retry-after"),
    code,
  });
}
async function req(
  method: "GET" | "POST",
  route: string,
  token?: string,
  data?: unknown,
  headers: Record<string, string> = {},
  base = BASE,
): Promise<{ res: Response; body: G03Response }> {
  const res = await fetch(base + "/api/v1/auth/" + route, {
    method,
    headers: {
      "x-real-ip": rateScope,
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(method === "POST" ? { body: JSON.stringify(data ?? {}) } : {}),
  });
  const raw = await res.text();
  let body: G03Response;
  try {
    body = JSON.parse(raw) as G03Response;
  } catch {
    body = { nonJson: true, data: {} };
  }
  record(method + " " + route.split("?")[0], res, body);
  return { res, body };
}
function privacy(x: { res: Response }) {
  expect(x.res.headers.get("cache-control")).toContain("no-store");
  expect(x.res.headers.get("referrer-policy")).toBe("no-referrer");
}
async function sessionRefreshToken(uid: string) {
  const id = randomUUID();
  const token = await generateRefreshToken(uid, id);
  await createRefreshSession(uid, id, createHash("sha256").update(token).digest("hex"), {
    expiresAt: new Date(Date.now() + 2 * 86400000),
    deviceId: "g03-synthetic",
  });
  return token;
}
function cookies(response: Response): Record<string, string> {
  const h = response.headers;
  const rows =
    "getSetCookie" in h && typeof h.getSetCookie === "function"
      ? h.getSetCookie()
      : (h.get("set-cookie") ?? "").split(/,(?=\s*gafus_)/);
  const out: Record<string, string> = {};
  for (const row of rows) {
    const match = /^(gafus_(?:access|refresh))=([^;]+)/.exec(row.trim());
    if (match) out[match[1]] = match[2];
    expect(row).toMatch(/HttpOnly/i);
    expect(row).toMatch(/Secure/i);
    expect(row).toMatch(/SameSite=Lax/i);
  }
  return out;
}
async function users() {
  const list = await prisma.user.findMany({
    where: { id: { in: [a, b] } },
    select: { id: true, username: true },
  });
  return list;
}
function startDropProxy() {
  const proxy = createServer((incoming, outgoing) => {
    if (incoming.method !== "POST" || incoming.url !== "/api/v1/auth/username-change") {
      outgoing.writeHead(404);
      outgoing.end();
      return;
    }
    const upstream = nodeRequest(
      {
        hostname: "127.0.0.1",
        port: 4120,
        method: "POST",
        path: incoming.url,
        headers: { ...incoming.headers, host: "127.0.0.1:4120", connection: "close" },
      },
      (response) => {
        // Drain the actual Hono acknowledgement then DROP the downstream TCP socket.
        response.resume();
        response.on("end", () => {
          resolveDropAck(response.statusCode ?? 0);
          outgoing.destroy();
        });
      },
    );
    upstream.on("error", () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  proxy.listen(4121, "127.0.0.1");
  return proxy;
}
(ACTIVE ? describe : describe.skip)(
  "AG1 G03 REAL signed JWT → Hono TCP → Core/Prisma PG14 + Redis8",
  () => {
    beforeEach((ctx) => {
      rateScope = "g03-" + RUN_KEY + ctx.task.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 60);
    });
    beforeAll(async () => {
      if (lstatSync(LEASE).isSymbolicLink() || realpathSync(LEASE) !== LEASE)
        throw Error("UNTRUSTED_LEASE");
      const lease = JSON.parse(readFileSync(LEASE, "utf8"));
      if (
        lease.id !== "AG4_G03_AG1_REAL_JWT_CORE_PG_REDIS_20261017_01" ||
        lease.state !== "ACTIVE_AG1_G03_EXCLUSIVE_TEST_ONLY" ||
        lease.ports.postgres !== 55458 ||
        lease.ports.redis !== 6396 ||
        lease.ports.hono !== 4120 ||
        lease.ports.socketDropProxy !== 4121 ||
        lease.database !== "gafus_g03_ag1_synthetic_20261017" ||
        Date.parse(lease.expiresUTC) < Date.now()
      )
        throw Error("EXPIRED_OR_WRONG_G03_LEASE");
      const identity = await prisma.$queryRawUnsafe<{ db: string; usr: string; port: number }[]>(
        "SELECT current_database() AS db,current_user AS usr,inet_server_port() AS port",
      );
      if (
        identity[0]?.db !== lease.database ||
        identity[0]?.usr !== lease.role ||
        identity[0]?.port !== 55458
      )
        throw Error("WRONG_POSTGRESQL_USER_DATABASE_PORT");
      if ((await prisma.user.count()) !== 0 || (await prisma.refreshToken.count()) !== 0)
        throw Error("NONEMPTY_SYNTHETIC_DATABASE");
      expect(await connection.ping()).toBe("PONG");
      a = randomUUID();
      b = randomUUID();
      oldNameA = "g03a_" + a.replaceAll("-", "").slice(0, 19);
      oldNameB = "g03b_" + b.replaceAll("-", "").slice(0, 19);
      await prisma.user.createMany({
        data: [
          {
            id: a,
            username: oldNameA,
            password: "synthetic-unused",
            email: null,
            role: "USER",
            registrationPending: false,
          },
          {
            id: b,
            username: oldNameB,
            password: "synthetic-unused",
            email: null,
            role: "USER",
            registrationPending: false,
          },
        ],
      });
      tokA = await generateAccessToken({ id: a, username: oldNameA, role: "USER" });
      tokB = await generateAccessToken({ id: b, username: oldNameB, role: "USER" });
      server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4120 });
      dropAck = new Promise<number>((resolve) => {
        resolveDropAck = resolve;
      });
      dropProxy = startDropProxy();
      await Promise.all([
        new Promise<void>((resolve) =>
          server!.listening ? resolve() : server!.once("listening", resolve),
        ),
        new Promise<void>((resolve) =>
          dropProxy!.listening ? resolve() : dropProxy!.once("listening", resolve),
        ),
      ]);
    });
    afterAll(async () => {
      if (dropProxy) await new Promise<void>((resolve) => dropProxy!.close(() => resolve()));
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      // Explicit own fixture IDs only. Never delete other users/databases.
      if (a && b) {
        await prisma.refreshToken.deleteMany({ where: { userId: { in: [a, b] } } });
        await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
      }
      const post = { users: await prisma.user.count(), tokens: await prisma.refreshToken.count() };
      writeFileSync(
        CAPTURE,
        JSON.stringify(
          {
            provenance:
              "G03 isolated real TCP/Hono JWT/Core/Prisma+Redis; synthetic minimal User/RefreshToken schema",
            trace,
            cleanup: post,
            retainsSecrets: false,
            fullAppStartup: false,
            realTlsBrowser: false,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      expect(post).toEqual({ users: 0, tokens: 0 });
      await prisma.$disconnect();
      await connection.quit();
    });
    it("R01 signed owner principal GET, B isolation, no unauth+invalid JWT", async () => {
      const mine = await req("GET", "username-available?username=" + oldNameA, tokA);
      expect(mine.res.status).toBe(200);
      expect(mine.body.data).toEqual({ available: true });
      privacy(mine);
      const other = await req("GET", "username-available?username=" + oldNameA, tokB);
      expect(other.res.status).toBe(200);
      expect(other.body.data).toEqual({ available: false });
      privacy(other);
      for (const token of [undefined, "synthetic-invalid-token"]) {
        const x = await req("GET", "username-available?username=" + oldNameA, token);
        expect(x.res.status).toBe(401);
        privacy(x);
      }
      expect((await users()).length).toBe(2);
    });
    it("R01 trusted Origin required for ambient cookie POST; native bearer unaffected", async () => {
      const path = "username-change",
        payload = { newUsername: "g03safe_" + a.slice(0, 8) };
      const cookie = { cookie: "gafus_access=" + tokA, "x-gafus-auth-transport": "cookie" };
      for (const origin of [undefined, "https://evil.gafus.ru"]) {
        const x = await req(
          "POST",
          path,
          undefined,
          payload,
          origin ? { ...cookie, origin } : cookie,
        );
        expect(x.res.status).toBe(403);
        privacy(x);
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).username).toBe(oldNameA);
    });
    it("R02 real PostgreSQL two-owner username race — exactly one 200 and one collision 400", async () => {
      const winner = "g03race_" + a.slice(0, 8);
      const xs = await Promise.all([
        req("POST", "username-change", tokA, { newUsername: winner.toUpperCase() }),
        req("POST", "username-change", tokB, { newUsername: winner }),
      ]);
      expect(xs.map((x) => x.res.status).sort()).toEqual([200, 400]);
      xs.forEach(privacy);
      const failure = xs.find((x) => x.res.status === 400)!;
      expect(failure.body.code).toBe("USERNAME_TAKEN");
      const names = (await users()).filter((x) => x.username === winner);
      expect(names).toHaveLength(1);
      expect(await prisma.user.findMany({ where: { username: winner } })).toHaveLength(1);
    });
    it("R03 stale signed JWT username until actual refresh: native DTO, rotation and /me", async () => {
      const current = (await prisma.user.findUniqueOrThrow({ where: { id: a } })).username;
      const stale = await req("GET", "me", tokA);
      expect(stale.res.status).toBe(200);
      expect(stale.body.data.username).toBe(oldNameA);
      const ref = await sessionRefreshToken(a);
      const refreshed = await req("POST", "refresh", undefined, { refreshToken: ref });
      expect(refreshed.res.status).toBe(200);
      const nextAccess = refreshed.body.data.accessToken as string;
      const nextRefresh = refreshed.body.data.refreshToken as string;
      expect(nextAccess).toBeTruthy();
      expect(nextRefresh).toBeTruthy();
      const me = await req("GET", "me", nextAccess);
      expect(me.body.data).toEqual({ id: a, username: current, role: "USER" });
      expect(await prisma.refreshToken.count({ where: { userId: a } })).toBe(2);
      expect(
        await prisma.refreshToken.count({ where: { userId: a, revokedAt: { not: null } } }),
      ).toBe(1);
    });
    it("R03 cookie Origin 403 vs trusted refresh Secure HttpOnly attributes, current /me", async () => {
      const old = await sessionRefreshToken(b);
      const marker = { "x-gafus-auth-transport": "cookie", cookie: "gafus_refresh=" + old };
      for (const origin of [undefined, "https://evil.gafus.ru"]) {
        const x = await req(
          "POST",
          "refresh",
          undefined,
          {},
          origin ? { ...marker, origin } : marker,
        );
        expect(x.res.status).toBe(403);
      }
      const valid = await req(
        "POST",
        "refresh",
        undefined,
        {},
        { ...marker, origin: "https://gafus.ru" },
      );
      expect(valid.res.status).toBe(200);
      expect(valid.body).toEqual({ success: true });
      expect(JSON.stringify(valid.body)).not.toContain("Token");
      const pair = cookies(valid.res);
      expect(pair.gafus_access).toBeTruthy();
      expect(pair.gafus_refresh).toBeTruthy();
      const me = await req("GET", "me", undefined, undefined, {
        cookie: "gafus_access=" + pair.gafus_access,
      });
      expect(me.res.status).toBe(200);
      const current = (await prisma.user.findUniqueOrThrow({ where: { id: b } })).username;
      expect(me.body.data.username).toBe(current);
    });
    it("R04 TCP drop AFTER Core+PG commit: client never receives ACK, owner can recover by GET", async () => {
      const desired = "g03loss_" + a.slice(0, 8);
      let failed = false;
      try {
        await req("POST", "username-change", tokA, { newUsername: desired }, {}, DROP);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      const deliveredUpstream = await Promise.race([
        dropAck,
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(Error("DROP_UPSTREAM_NOT_ACKED")), 5000),
        ),
      ]);
      expect(deliveredUpstream).toBe(200);
      // No mutation replay: only authenticated read of durable state.
      const arow = await prisma.user.findUniqueOrThrow({ where: { id: a } });
      expect(arow.username).toBe(desired);
      const owner = await req("GET", "username-available?username=" + desired, tokA);
      const stranger = await req("GET", "username-available?username=" + desired, tokB);
      expect(owner.body.data.available).toBe(true);
      expect(stranger.body.data.available).toBe(false);
      trace.push({
        case: "R04_DROP_POST_COMMIT_RECOVERY_NO_RETRY",
        status: "CLIENT_SOCKET_LOST_AFTER_200",
        cache: null,
        referrer: null,
        retryAfter: null,
      });
    });
    it("R05 TCP bodyLimit >1024: observed 413 nonJSON privacy vs previous in-process 400", async () => {
      const big = await req("POST", "username-change", tokA, { newUsername: "a".repeat(2000) });
      expect(big.res.status).toBe(413);
      expect(big.body.nonJson).toBe(true);
      privacy(big);
    });
    it("R06 real PG injected before-update exception: bounded 503, DB unchanged", async () => {
      const desired = "g03sqlfail_" + a.slice(0, 8);
      const previous = (await prisma.user.findUniqueOrThrow({ where: { id: a } })).username;
      // Trigger exists ONLY inside the fresh, disposable G03 test DB.
      await prisma.$executeRawUnsafe(`CREATE FUNCTION g03_synthetic_fail_username() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."username" LIKE 'g03sqlfail_%' THEN
        RAISE EXCEPTION 'G03_SYNTHETIC_INTERNAL_SQL_CANARY'; END IF;
        RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER g03_synthetic_fail_username
      BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION g03_synthetic_fail_username()`);
      try {
        const result = await req("POST", "username-change", tokA, { newUsername: desired });
        expect(result.res.status).toBe(503);
        privacy(result);
        expect(result.body.code).toBe("USERNAME_RESULT_UNCONFIRMED");
        expect(JSON.stringify(result.body)).not.toContain("G03_SYNTHETIC_INTERNAL_SQL_CANARY");
        expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).username).toBe(previous);
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS g03_synthetic_fail_username ON "User"',
        );
        await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS g03_synthetic_fail_username()");
      }
    });
    it("R07 real PG COMMIT + actual Core DB read, injected lost readback -> HTTP500 no false ACK", async () => {
      const desired = "g03unknown_" + a.slice(0, 8);
      armG03PostwriteReadbackNull(a, desired);
      let result: Awaited<ReturnType<typeof req>>;
      let observedRead: ReturnType<typeof consumeG03PostwriteReadbackEvidence>;
      try {
        result = await req("POST", "username-change", tokA, { newUsername: desired });
      } finally {
        // The adapter applies ONLY to this final DTO read, never SQL mutation.
        observedRead = consumeG03PostwriteReadbackEvidence();
        clearG03PostwriteReadbackFault();
      }
      expect(observedRead).toEqual({ actorId: a, username: desired });
      expect(result.res.status).toBe(500);
      privacy(result);
      expect(result.body).toMatchObject({ success: false, code: "USERNAME_RESULT_UNCONFIRMED" });
      expect(result.body.data?.user).toBeUndefined();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).username).toBe(desired);
      const existing = await req("GET", "username-available?username=" + desired, tokB);
      expect(existing.res.status).toBe(200);
      expect(existing.body.data.available).toBe(false);
      trace.push({
        case: "R07_REAL_SQL_COMMIT_ACTUAL_READ_THEN_ADAPTER_NULL_NO_REPOST",
        status: 500,
        cache: result.res.headers.get("cache-control"),
        referrer: result.res.headers.get("referrer-policy"),
        retryAfter: null,
        code: result.body.code,
      });
    });
    it("R05 actual Redis 15/min username GET gate and 429 status/header", async () => {
      const headers = { "x-real-ip": "g03-limit-" + RUN_KEY };
      const responses = await Promise.all(
        Array.from({ length: 18 }, () =>
          req("GET", "username-available?username=normalg03", tokB, undefined, headers),
        ),
      );
      const counts = {
        ok: responses.filter((x) => x.res.status === 200).length,
        limited: responses.filter((x) => x.res.status === 429).length,
      };
      expect(counts.limited).toBeGreaterThanOrEqual(1);
      expect(counts.ok).toBeGreaterThanOrEqual(1);
      for (const x of responses.filter((x) => x.res.status === 429)) privacy(x);
      trace.push({
        case: "R05_REAL_REDIS_RATE_RESULT",
        status: `${counts.ok}x200,${counts.limited}x429`,
        cache: null,
        referrer: null,
        retryAfter: responses.find((x) => x.res.status === 429)!.res.headers.get("retry-after"),
      });
    });
  },
);

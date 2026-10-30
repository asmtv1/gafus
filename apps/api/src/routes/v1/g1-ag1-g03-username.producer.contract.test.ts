/** AG1 G03 existing GET/POST Hono producer snapshot. NOT frozen AG4 protocol.
 * In-process real Hono/Auth/Origin/Zod; mocked JWT verification/Core/Prisma.
 * Each case records observed CURRENT source behavior; a PASS of a known
 * insecure/unfrozen behavior is evidence of a GAP, not G03 acceptance.
 */
import { Hono } from "hono";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const m = vi.hoisted(() => ({
  verify: vi.fn(),
  reg: vi.fn(),
  availability: vi.fn(),
  change: vi.fn(),
  authRead: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({
  verifyAccessToken: m.verify,
  assertCompletedUser: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));
vi.mock("@gafus/auth", () => ({ InvalidPasswordResetTokenError: class extends Error {} }));
vi.mock("@gafus/core/services/auth", () => ({
  isRegistrationCompleted: m.reg,
  isUsernameAvailable: m.availability,
  changeUsername: m.change,
  getAuthUserById: m.authRead,
  REGISTRATION_CHANNEL: { WEB: "WEB", IOS: "IOS", ANDROID: "ANDROID" },
}));
vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_VK_LOGIN_IOS: "mobile_vk_login_ios",
  getMobileFeatureFlagEnabled: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: m.log, error: m.log, warn: vi.fn(), debug: vi.fn() }),
}));
import { authRoutes } from "./auth";
import { corsMiddleware } from "../../middleware/cors";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const CAPTURE = ROOT + "/apps/api/.g1-g03-username-producer-ag1-20261017/captures";
const enabled =
  process.env.AG1_G03_HONO_CAPTURE_DIR === CAPTURE &&
  process.env.TMPDIR?.startsWith(ROOT + "/apps/api/.g1-g03-username-producer-ag1-20261017/tmp/");
const records: {
  method: string;
  status: number;
  body: unknown;
  cacheControl: string | null;
  retryAfter: string | null;
  origin: string | null;
  mode: string;
  coreCalls: { available: number; change: number; read: number };
}[] = [];
const root = () => {
  const app = new Hono();
  app.use("/api/v1/auth/*", corsMiddleware);
  app.route("/api/v1/auth", authRoutes);
  return app;
};
type Mode = "A" | "B" | "guest" | "expired" | "cookieA" | "cookieB" | "forged";
async function send(method: "GET" | "POST", input: unknown, mode: Mode = "A", origin?: string) {
  const headers: Record<string, string> = {};
  if (mode === "A" || mode === "B") headers.authorization = "Bearer synthetic-" + mode;
  else if (mode === "expired") headers.authorization = "Bearer synthetic-expired";
  else if (mode === "forged") headers.authorization = "Bearer invalid.fake";
  else if (mode === "cookieA" || mode === "cookieB")
    headers.cookie = "gafus_access=synthetic-" + mode.at(-1);
  if (origin !== undefined) headers.origin = origin;
  if (method === "POST") headers["content-type"] = "application/json";
  const path =
    "/api/v1/auth/" +
    (method === "GET"
      ? "username-available?username=" + encodeURIComponent(String(input))
      : "username-change");
  const res = await root().request("http://test.local" + path, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
  });
  const responseText = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { nonJsonResponse: true };
  }
  records.push({
    method,
    status: res.status,
    body: data,
    cacheControl: res.headers.get("cache-control"),
    retryAfter: res.headers.get("retry-after"),
    origin: origin ?? null,
    mode,
    coreCalls: {
      available: m.availability.mock.calls.length,
      change: m.change.mock.calls.length,
      read: m.authRead.mock.calls.length,
    },
  });
  return { status: res.status, data, cache: res.headers.get("cache-control") };
}
beforeEach(() => {
  records.length = 0;
  vi.clearAllMocks();
  m.verify.mockImplementation(async (raw: string) =>
    raw === "synthetic-A" || raw === "synthetic-B" || raw === "synthetic-pending"
      ? {
          id: raw.at(-1) === "A" ? "A" : raw.at(-1) === "B" ? "B" : "pending",
          username: "current",
          role: "USER",
        }
      : null,
  );
  m.reg.mockImplementation(async (id: string) => id !== "pending");
  m.availability.mockImplementation(async (value: string, id: string) =>
    id === "A" ? value.toLowerCase() !== "claimed" : "false" !== value.toLowerCase(),
  );
  m.change.mockResolvedValue(undefined);
  m.authRead.mockImplementation(async (id: string) => ({
    id,
    username: "newusername",
    role: "USER",
  }));
});
afterEach(async (context) => {
  const caseId = context.task.name.match(/G03-(\d\d)/)?.[0];
  if (!enabled || !caseId) return;
  mkdirSync(CAPTURE, { recursive: true });
  writeFileSync(
    join(CAPTURE, caseId + ".json"),
    JSON.stringify(
      {
        caseId,
        provenance:
          "CURRENT_HONO_ZOD_CORS_AUTH_MIDDLEWARE__JWT_AND_CORE_INJECTED_NO_SQL_NO_RATE_LIMITER",
        acceptedContract: false,
        actualHono: true,
        realJwt: false,
        realPg: false,
        redisLimiterMounted: false,
        observations: records,
        secret: "NO_REAL_TOKEN_OR_USER_DATA",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
});
const asJson = (x: { data: unknown }) =>
  x.data as {
    success?: boolean;
    data?: { available?: boolean; user?: { id: string; username: string; role: string } };
    code?: string;
    error?: string;
  };
(enabled ? describe : describe.skip)(
  "AG1 G03 28-matrix producer CURRENT observations (no AG4 freeze yet)",
  () => {
    it("G03-01 GET available boolean self owner DTO", async () => {
      const x = await send("GET", "NewUsername");
      expect(x.status).toBe(200);
      expect(asJson(x).data).toEqual({ available: true });
      expect(m.availability).toHaveBeenCalledWith("NewUsername", "A");
    });
    it("G03-02 GET invalid empty/overlength/nonascii rejects 400 before Core", async () => {
      for (const s of ["", "ab", "x".repeat(51), "имя"]) {
        const x = await send("GET", s);
        expect(x.status).toBe(400);
      }
      expect(m.availability).not.toHaveBeenCalled();
    });
    it("G03-03 GET guest/expired/forged identity 401 before Core", async () => {
      for (const mode of ["guest", "expired", "forged"] as const) {
        const x = await send("GET", "username", mode);
        expect(x.status).toBe(401);
      }
      expect(m.availability).not.toHaveBeenCalled();
    });
    it("G03-04 GET B owner only boolean, no account fields", async () => {
      const a = await send("GET", "claimed", "A");
      const b = await send("GET", "claimed", "B");
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(asJson(a).data).toEqual({ available: false });
      expect(Object.keys(asJson(b).data ?? {})).toEqual(["available"]);
      expect(m.availability).toHaveBeenCalledWith("claimed", "B");
    });
    it("G03-05 GET Core unavailable current generic 500 no raw error", async () => {
      m.availability.mockRejectedValueOnce(Error("SYNTHETIC_SQL_SECRET"));
      const x = await send("GET", "newname");
      expect(x.status).toBe(500);
      expect(JSON.stringify(x.data)).not.toContain("SYNTHETIC_SQL_SECRET");
    });
    it.skip("G03-06 CLIENT_ONLY stale debounce and out-of-order UI responses, AG2 S1 test required", () =>
      undefined);
    it.skip("G03-07 REAL_SQL_UNAUTHORIZED availability hint vs competing actual PostgreSQL unique claim", () =>
      undefined);
    it.skip("G03-08 RATE_UNMOUNTED real rate limit 429/Retry-After not present in Hono test assembly", () =>
      undefined);
    it("G03-09 POST canonical user DTO from Core read, owner from session", async () => {
      const x = await send("POST", { newUsername: "NewUsername" });
      expect(x.status).toBe(200);
      expect(asJson(x).data?.user).toEqual({ id: "A", username: "newusername", role: "USER" });
      expect(m.change).toHaveBeenCalledWith("A", "NewUsername");
      expect(m.authRead).toHaveBeenCalledWith("A");
    });
    it("G03-10 POST supplied body userId cannot override current identity (Zod strips unknown)", async () => {
      const x = await send("POST", { newUsername: "newusername", userId: "B" });
      expect(x.status).toBe(200);
      expect(m.change).toHaveBeenCalledWith("A", "newusername");
      expect(m.authRead).toHaveBeenCalledWith("A");
    });
    it("G03-11 POST bad validation 400 and >1024 payload bounded, no valid Core dispatch", async () => {
      for (const body of [
        { newUsername: "ab" },
        { newUsername: "юзер" },
        { newUsername: "x".repeat(51) },
        { newUsername: 2 },
      ]) {
        const x = await send("POST", body);
        expect(x.status).toBe(400);
      }
      const oversized = await send("POST", { newUsername: "a".repeat(1500) });
      expect(oversized.status).toBe(400);
      expect(asJson(oversized)).toMatchObject({ nonJsonResponse: true });
      expect(m.change).not.toHaveBeenCalled();
    });
    it("G03-12 GAP current POST collision returns 400 raw human string, not frozen 409", async () => {
      m.change.mockRejectedValueOnce(Error("Логин уже занят"));
      const x = await send("POST", { newUsername: "claimed" });
      expect(x.status).toBe(400);
      expect(asJson(x).error).toBe("Логин уже занят");
      expect(asJson(x).code).toBeUndefined();
    });
    it.skip("G03-13 REAL_SQL_UNAUTHORIZED two-actor unique claim race requires AG4 G03 PG lease", () =>
      undefined);
    it("G03-14 POST guest expired or forged 401, no Core mutation", async () => {
      for (const mode of ["guest", "expired", "forged"] as const) {
        const x = await send("POST", { newUsername: "newusername" }, mode);
        expect(x.status).toBe(401);
      }
      expect(m.change).not.toHaveBeenCalled();
    });
    it("G03-15 POST ambient cookie absent/hostile Origin 403, trusted allowlist permits", async () => {
      for (const origin of [undefined, "https://gafus.ru.attacker.invalid"]) {
        const x = await send("POST", { newUsername: "newusername" }, "cookieA", origin);
        expect(x.status).toBe(403);
      }
      expect(m.change).not.toHaveBeenCalled();
      const good = await send(
        "POST",
        { newUsername: "newusername" },
        "cookieA",
        "https://gafus.ru",
      );
      expect(good.status).toBe(200);
    });
    it("G03-16 POST actor B body owner A cannot mutate actor A", async () => {
      const x = await send("POST", { newUsername: "newusername", userId: "A" }, "B");
      expect(x.status).toBe(200);
      expect(m.change).toHaveBeenCalledWith("B", "newusername");
      expect(asJson(x).data?.user?.id).toBe("B");
    });
    it.skip("G03-17 CLIENT_ONLY rapid double click local UI guard and server race separate", () =>
      undefined);
    it.skip("G03-18 TRANSPORT_UNPROVEN lost ACK actual TCP cannot infer durable outcome from Hono mock", () =>
      undefined);
    it("G03-19 GAP commit then read returned null produces HTTP500 ambiguous ACK", async () => {
      m.authRead.mockResolvedValueOnce(null);
      const x = await send("POST", { newUsername: "newusername" });
      expect(x.status).toBe(500);
      expect(m.change).toHaveBeenCalledTimes(1);
      expect(asJson(x).success).toBe(false);
    });
    it("G03-20 GAP unexpected Core error currently mapped 400 and raw error reflected", async () => {
      m.change.mockRejectedValueOnce(Error("SYNTHETIC_SQL_SECRET"));
      const x = await send("POST", { newUsername: "newusername" });
      expect(x.status).toBe(400);
      expect(asJson(x).error).toBe("SYNTHETIC_SQL_SECRET");
    });
    it.skip("G03-21 RATE_UNMOUNTED POST limiter 429/Retry-After unverified", () => undefined);
    it.skip("G03-22 CLIENT_ONLY cache/session/profile link needs AG2 S1", () => undefined);
    it.skip("G03-23 CLIENT_ONLY committed POST+session refresh failure and no retry needs AG2 S1", () =>
      undefined);
    it.skip("G03-24 CLIENT_ONLY actor A pending to B session fences AG2 S1", () => undefined);
    it.skip("G03-25 PRIVACY_GAP raw Core error reflection currently demonstrated by G03-20", () =>
      undefined);
    it.skip("G03-26 CLIENT_ONLY a11y/navigation/Enter/cancel/back route AG2 S1", () => undefined);
    it.skip("G03-27 STRICT_BROWSER_TLS_BLOCKED macOS Chrome profile CA trust, no bypass", () =>
      undefined);
    it.skip("G03-28 AG4_G03_INDEPENDENT producer manifest + method-specific release gate PENDING", () =>
      undefined);
  },
);

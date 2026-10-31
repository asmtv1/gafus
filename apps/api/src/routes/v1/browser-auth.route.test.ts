import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  validateCredentials: vi.fn(),
  registerUserService: vi.fn(),
  sendPasswordResetRequestByEmail: vi.fn(),
  resetPassword: vi.fn(),
  getAuthUserById: vi.fn(),
  createRefreshSession: vi.fn(),
  validateRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  isRegistrationCompleted: vi.fn(),
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  assertCompletedUser: vi.fn(),
}));

vi.mock("@gafus/core/services/auth", async importOriginal => ({
  ...(await importOriginal<object>()),
  validateCredentials: mocks.validateCredentials,
  registerUserService: mocks.registerUserService,
  sendPasswordResetRequestByEmail: mocks.sendPasswordResetRequestByEmail,
  resetPassword: mocks.resetPassword,
  getAuthUserById: mocks.getAuthUserById,
  createRefreshSession: mocks.createRefreshSession,
  validateRefreshToken: mocks.validateRefreshToken,
  rotateRefreshToken: mocks.rotateRefreshToken,
  revokeRefreshToken: mocks.revokeRefreshToken,
  isRegistrationCompleted: mocks.isRegistrationCompleted,
}));
vi.mock("@gafus/auth/jwt", async importOriginal => ({
  ...(await importOriginal<object>()),
  verifyAccessToken: mocks.verifyAccessToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
  generateAccessToken: mocks.generateAccessToken,
  generateRefreshToken: mocks.generateRefreshToken,
  assertCompletedUser: mocks.assertCompletedUser,
}));

import { authRoutes } from "./auth";
import { authMiddleware } from "../../middleware/auth";
import {
  getCurrentUser as webGetCurrentUser,
  login as webLogin,
  logout as webLogout,
  refreshSession as webRefreshSession,
} from "../../../../../apps/web-vite/src/shared/auth/authApi";
import { registerAccount as webRegisterAccount } from
  "../../../../../apps/web-vite/src/shared/auth/registerApi";
import { requestPasswordReset, confirmPasswordReset } from
  "../../../../../apps/web-vite/src/shared/auth/passwordRecoveryApi";

const person = { id: "test-user", username: "test_user", role: "USER" };
const BROWSER = { "x-gafus-auth-transport": "cookie", origin: "https://gafus.ru" };
function app() {
  const hono = new Hono();
  hono.route("/api/v1/auth", authRoutes);
  hono.post("/api/v1/private", authMiddleware, c => c.json({ ok: true }));
  return hono;
}
function post(path: string, headers: Record<string, string>, json: object) {
  return app().request("http://local.test/api/v1/auth/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(json),
  });
}

describe("MIG-AUTH-010 cookie + bearer interoperability", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateCredentials.mockResolvedValue({ success: true, user: person });
    mocks.registerUserService.mockResolvedValue({ userId: person.id });
    mocks.sendPasswordResetRequestByEmail.mockResolvedValue(undefined);
    mocks.resetPassword.mockResolvedValue(undefined);
    mocks.getAuthUserById.mockResolvedValue(person);
    mocks.generateAccessToken.mockResolvedValue("test-access-jwt");
    mocks.generateRefreshToken.mockResolvedValue("test-refresh-jwt");
    mocks.verifyRefreshToken.mockResolvedValue({ userId: person.id, tokenId: "test-uuid" });
    mocks.validateRefreshToken.mockResolvedValue({ valid: true, user: person });
    mocks.verifyAccessToken.mockResolvedValue(person);
    mocks.isRegistrationCompleted.mockResolvedValue(true);
  });

  it("mobile Bearer login preserves both tokens in JSON without cookies", async () => {
    const response = await post("login", {}, { username: "test_user", password: "valid-pw" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, data: { user: person, accessToken: "test-access-jwt", refreshToken: "test-refresh-jwt" },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("browser login returns profile without exposing JWT and sets HttpOnly cookies", async () => {
    const response = await post("login", BROWSER, { username: "test_user", password: "valid-pw" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { user: person } });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().every(c => c.includes("HttpOnly") && c.includes("Secure"))).toBe(true);
  });

  it.each(["https://adminka.gafus.ru", "https://trainer-panel.gafus.ru"])(
    "permits actual production panel Origin %s for browser cookie login",
    async (origin) => {
      vi.stubEnv("NODE_ENV", "production");
      const response = await post("login", { ...BROWSER, origin }, {
        username: "test_user", password: "valid-pw",
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: { user: person } });
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.getSetCookie().every(cookie => cookie.includes("Secure") && cookie.includes("HttpOnly"))).toBe(true);
      expect(mocks.validateCredentials).toHaveBeenCalledOnce();
    },
  );

  it.each(["https://admin.gafus.ru", "https://trainer.gafus.ru", "https://adminka.gafus.ru.evil.example"])(
    "rejects obsolete or lookalike browser Origin %s before credential validation",
    async (origin) => {
      const response = await post("login", { ...BROWSER, origin }, {
        username: "test_user", password: "valid-pw",
      });
      expect(response.status).toBe(403);
      expect(mocks.validateCredentials).not.toHaveBeenCalled();
    },
  );

  it("rejects browser cookie login from untrusted origin", async () => {
    const response = await post("login", { ...BROWSER, origin: "https://evil.example" }, {
      username: "test_user", password: "valid-pw",
    });
    expect(response.status).toBe(403);
    expect(mocks.validateCredentials).not.toHaveBeenCalled();
  });

  it("permits real registered cookie login ONLY under attested local Refactor flags", async () => {
    const local = { "x-gafus-auth-transport": "cookie", origin: "http://127.0.0.1:5173" };
    const body = { username: "test_user", password: "valid-pw" };
    const denied = await post("login", local, body);
    expect(denied.status).toBe(403);
    expect(mocks.validateCredentials).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
    vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "1");
    vi.stubEnv("API_HOST", "127.0.0.1");
    vi.stubEnv("API_PORT", "3001");
    const login = await post("login", local, body);
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ success: true, data: { user: person } });
    expect(login.headers.getSetCookie()).toHaveLength(2);
    expect(login.headers.getSetCookie().every(
      cookie => !cookie.includes("Secure") && cookie.includes("HttpOnly") &&
        cookie.includes("SameSite=Lax") && cookie.includes("Path=/api/v1"),
    )).toBe(true);
    expect(mocks.validateCredentials).toHaveBeenCalledOnce();
    const other = await post("login", { ...local, origin: "http://localhost:5173" }, body);
    expect(other.status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    const inProduction = await post("login", local, body);
    expect(inProduction.status).toBe(403);
  });

  it("browser registration returns profile and cookies, never JWT fields", async () => {
    const response = await post("register", BROWSER, {
      name: "test_user",
      email: "tester@example.com",
      password: "Password1x",
      registrationChannel: "WEB",
      tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
      consentPayload: {
        acceptPersonalData: true,
        acceptPrivacyPolicy: true,
        acceptDataDistribution: true,
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { user: person } });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(mocks.registerUserService).toHaveBeenCalledOnce();
  });

  it("Vite registration completes Core/Hono contract and returns only cookie session", async () => {
    const registerBody = {
      name: "test_user",
      email: "tester@example.com",
      password: "Password1x",
      registrationChannel: "WEB" as const,
      tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
      consentPayload: {
        acceptPersonalData: true as const,
        acceptPrivacyPolicy: true as const,
        acceptDataDistribution: true as const,
      },
    };
    let cookies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit) => {
      const headers = new Headers(options.headers);
      headers.set("Origin", "https://gafus.ru");
      const response = await app().request("https://gafus.ru" + path, {
        method: options.method,
        headers,
        body: options.body,
      });
      cookies = response.headers.getSetCookie();
      return response;
    }));
    expect(await webRegisterAccount(registerBody)).toEqual({ user: person });
    expect(mocks.registerUserService).toHaveBeenCalledOnce();
    expect(mocks.registerUserService.mock.calls[0][0]).toBe("test_user");
    expect(mocks.registerUserService.mock.calls[0][1]).toBe("tester@example.com");
    expect(mocks.registerUserService.mock.calls[0][3]).toBe("WEB");
    expect(cookies).toHaveLength(2);
    expect(cookies.every(cookie => cookie.includes("HttpOnly") && cookie.includes("Secure"))).toBe(true);
  });

  it("rejects missing legal consent before calling Core or issuing cookies", async () => {
    const response = await post("register", BROWSER, {
      name: "test_user",
      email: "tester@example.com",
      password: "Password1x",
      tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
      consentPayload: {
        acceptPersonalData: true, acceptPrivacyPolicy: true,
        acceptDataDistribution: false,
      },
    });
    expect(response.status).toBe(400);
    expect(mocks.registerUserService).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("Vite password-reset client uses Hono email and token handlers", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) => {
      calls.push(path);
      return app().request("https://gafus.ru" + path, {
        method: options.method,
        headers: options.headers,
        body: options.body,
      });
    }));
    await requestPasswordReset("person@example.org");
    expect(mocks.sendPasswordResetRequestByEmail).toHaveBeenCalledWith("person@example.org");
    await confirmPasswordReset("a".repeat(40), "Password1");
    expect(mocks.resetPassword).toHaveBeenCalledWith("a".repeat(40), "Password1");
    expect(calls).toEqual([
      "/api/v1/auth/password-reset-request", "/api/v1/auth/reset-password",
    ]);
  });

  it("Hono reset rejects weak passwords before calling Core", async () => {
    const response = await post("reset-password", {}, {
      token: "a".repeat(40), password: "weak",
    });
    expect(response.status).toBe(400);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("cookie refresh rotates tokens but never returns them to browser JavaScript", async () => {
    const response = await post("refresh", { ...BROWSER, cookie: "gafus_refresh=test-refresh-jwt" }, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(mocks.rotateRefreshToken).toHaveBeenCalledOnce();
  });

  it("mobile refresh keeps its existing token JSON shape", async () => {
    const response = await post("refresh", {}, { refreshToken: "test-refresh-jwt" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: {
      accessToken: "test-access-jwt", refreshToken: "test-refresh-jwt",
    } });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("recent simultaneous refresh yields 409 instead of revoking all sessions", async () => {
    mocks.validateRefreshToken.mockResolvedValueOnce({ valid: false, reason: "recently_consumed" });
    const response = await post("refresh", {}, { refreshToken: "test-refresh-jwt" });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("REFRESH_CONFLICT");
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it("transaction CAS loser receives 409 without a new session", async () => {
    const { RefreshRotationConflictError } = await import("@gafus/core/services/auth");
    mocks.rotateRefreshToken.mockRejectedValueOnce(new RefreshRotationConflictError());
    const response = await post("refresh", {}, { refreshToken: "test-refresh-jwt" });
    expect(response.status).toBe(409);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("rejects cookie refresh without Origin before checking token", async () => {
    const response = await post("refresh", {
      "x-gafus-auth-transport": "cookie", cookie: "gafus_refresh=test-refresh-jwt",
    }, {});
    expect(response.status).toBe(403);
    expect(mocks.verifyRefreshToken).not.toHaveBeenCalled();
  });

  it("GET /me accepts Bearer or cookie, but rejects absent auth", async () => {
    const absent = await app().request("/api/v1/auth/me");
    expect(absent.status).toBe(401);
    const bearer = await app().request("/api/v1/auth/me", { headers: { Authorization: "Bearer test-access-jwt" } });
    expect(bearer.status).toBe(200);
    expect((await bearer.json()).data).toEqual(person);
    const cookie = await app().request("/api/v1/auth/me", { headers: { cookie: "gafus_access=test-access-jwt" } });
    expect(cookie.status).toBe(200);
    expect((await cookie.json()).data).toEqual(person);
  });

  it("cookie-authorized POST requires trusted Origin; Bearer native POST unchanged", async () => {
    const cookie = "gafus_access=test-access-jwt";
    const denied = await app().request("/api/v1/private", { method: "POST", headers: { cookie } });
    expect(denied.status).toBe(403);
    const accepted = await app().request("/api/v1/private", { method: "POST", headers: { cookie, origin: "https://gafus.ru" } });
    expect(accepted.status).toBe(200);
    const mobile = await app().request("/api/v1/private", { method: "POST", headers: { Authorization: "Bearer test-access-jwt" } });
    expect(mobile.status).toBe(200);
  });

  it("revocation failure is visible to browser and does not clear its cookie", async () => {
    mocks.revokeRefreshToken.mockRejectedValueOnce(new Error("transient-db-error"));
    const response = await post("logout", { ...BROWSER, cookie: "gafus_refresh=test-refresh-jwt" }, {});
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("native logout never acknowledges a failed database revocation", async () => {
    mocks.revokeRefreshToken.mockRejectedValueOnce(new Error("db_unavailable"));
    const response = await post("logout", {}, { refreshToken: "test-refresh-jwt" });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("LOGOUT_REVOKE_FAILED");
  });

  it("Vite Web API client performs cookie login/me/refresh/logout via real Hono handlers", async () => {
    const cookieJar = new Map<string, string>();
    const requests: string[] = [];
    const hono = app();
    const mockedFetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (!url.startsWith("/api/v1/")) throw new Error("Unexpected external URL");
      requests.push(url);
      const headers = new Headers(options?.headers);
      headers.set("Origin", "https://gafus.ru");
      if (cookieJar.size > 0) {
        headers.set("Cookie", [...cookieJar].map(([name, value]) => name + "=" + value).join("; "));
      }
      const response = await hono.request(new Request("https://gafus.ru" + url, {
        ...options,
        headers,
      }));
      for (const item of response.headers.getSetCookie()) {
        const cookie = item.split(";")[0];
        const index = cookie.indexOf("=");
        const name = cookie.slice(0, index);
        const value = cookie.slice(index + 1);
        if (item.includes("Max-Age=0") || value.length === 0) cookieJar.delete(name);
        else cookieJar.set(name, value);
      }
      return response;
    });
    vi.stubGlobal("fetch", mockedFetch);
    try {
      const loggedIn = await webLogin({ username: "test_user", password: "valid-pw" });
      expect(loggedIn.user).toEqual(person);
      expect([...cookieJar.keys()].sort()).toEqual(["gafus_access", "gafus_refresh"]);
      expect(await webGetCurrentUser()).toEqual(person);
      expect(await webRefreshSession()).toBeUndefined();
      expect(await webLogout()).toBeUndefined();
      expect([...cookieJar.keys()]).toEqual([]);
      expect(await webGetCurrentUser()).toBeNull();
      expect(requests).toEqual([
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
        "/api/v1/auth/refresh",
      ]);
      expect(mocks.revokeRefreshToken).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("browser flow login -> cookie /me -> refresh -> logout", async () => {
    const login = await post("login", BROWSER, { username: "test_user", password: "valid-pw" });
    expect(login.status).toBe(200);
    const pair = login.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
    expect(pair).toContain("gafus_access=");
    expect(pair).toContain("gafus_refresh=");

    const me = await app().request("/api/v1/auth/me", { headers: { cookie: pair } });
    expect(me.status).toBe(200);
    expect((await me.json()).data).toEqual(person);

    const refresh = await post("refresh", { ...BROWSER, cookie: pair }, {});
    expect(refresh.status).toBe(200);
    expect(refresh.headers.getSetCookie()).toHaveLength(2);

    const logout = await post("logout", { ...BROWSER, cookie: pair }, {});
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie()).toHaveLength(2);
  });

  it("browser logout revokes refresh and clears cookies", async () => {
    const response = await post("logout", { ...BROWSER, cookie: "gafus_refresh=test-refresh-jwt" }, {});
    expect(response.status).toBe(200);
    expect(mocks.revokeRefreshToken).toHaveBeenCalledOnce();
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().every(c => c.includes("Max-Age=0"))).toBe(true);
  });
});

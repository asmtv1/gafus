import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revoke = vi.hoisted(() => vi.fn());
const verify = vi.hoisted(() => vi.fn());
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(),
  revokeAllUserTokens: revoke,
  isRegistrationCompleted: async () => true,
}));
vi.mock("@gafus/auth/jwt", async (importOriginal) => ({
  ...await importOriginal<object>(),
  verifyAccessToken: verify,
}));
import { authRoutes } from "./auth";

const app = new Hono().route("/api/v1/auth", authRoutes);
const url = "/api/v1/auth/logout-all";
const cookieHeaders = {
  "x-gafus-auth-transport": "cookie",
  "origin": "http://127.0.0.1:5173",
  "cookie": "gafus_access=fake-web-access; gafus_refresh=fake-refresh",
  "content-type": "application/json",
};
const issue = (headers: Record<string, string> = cookieHeaders) =>
  app.request(url, { method: "POST", headers, body: "{}" });

describe("WEB1 POST auth/logout-all — registered Hono and Core revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revoke.mockReset();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
    vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "1");
    vi.stubEnv("API_HOST", "127.0.0.1");
    vi.stubEnv("API_PORT", "3001");
    verify.mockResolvedValue({ id: "owner-A", username: "owner", role: "USER" });
    revoke.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("revokes only the authenticated user; clears both cookies after Core COMMIT", async () => {
    const response = await issue();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("owner-A");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("gafus_access=");
    expect(cookie).toContain("gafus_refresh=");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("401 if no cookie/bearer; 403 for untrusted cookie Origin, zero Core writes", async () => {
    const noAuth = await issue({"content-type": "application/json"});
    expect(noAuth.status).toBe(401);
    const forged = await issue({...cookieHeaders, origin: "https://evil.example"});
    expect(forged.status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
  });
  it("revocation storage failure is 503; never clears cookies or claims success", async () => {
    revoke.mockRejectedValueOnce(new Error("synthetic database failure"));
    const result = await issue();
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({success:false,code:"LOGOUT_ALL_REVOKE_FAILED"});
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
  it("supports explicit Mobile bearer with no cookie clearing", async () => {
    const result = await issue({authorization:"Bearer synthetic", "content-type":"application/json"});
    expect(result.status).toBe(200);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(result.headers.get("set-cookie")).toBeNull();
  });
});

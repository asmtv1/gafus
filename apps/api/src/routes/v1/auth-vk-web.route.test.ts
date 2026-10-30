import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  createContext: vi.fn(), context: vi.fn(), exchange: vi.fn(), claim: vi.fn(),
  complete: vi.fn(), grant: vi.fn(), summary: vi.fn(), refreshSession: vi.fn(),
  assertCompleted: vi.fn(), access: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(),
  createVkRegistrationContextWithPromo: mock.createContext,
  getValidVkRegistrationContext: mock.context,
  exchangeVkCodeAndGetUser: mock.exchange,
  claimVkRegistrationContextUser: mock.claim,
  completeVkRegistration: mock.complete,
  consumeVkIdOneTimeUser: mock.grant,
  getVkConsentContextSummary: mock.summary,
  createRefreshSession: mock.refreshSession,
}));
vi.mock("@gafus/auth/jwt", async original => ({
  ...await original<object>(),
  assertCompletedUser: mock.assertCompleted,
  generateAccessToken: mock.access,
  generateRefreshToken: mock.refresh,
}));
import { webVkRoutes } from "./auth-vk-web";

const app = new Hono().route("/api/v1/auth/vk-web", webVkRoutes);
const original = Object.fromEntries([
  "NODE_ENV", "WEB_APP_URL", "VK_WEB_REDIRECT_URI", "VK_CLIENT_ID",
  "JWT_REFRESH_SECRET", "VK_WEB_COOKIE_SECRET", "API_PORT", "API_HOST",
  "GAFUS_LOCAL_ISOLATED_API", "GAFUS_LOCAL_BROWSER_AUTH",
].map(key => [key, process.env[key]]));
const base = "http://127.0.0.1:5173";
const endpoint = "/api/v1/auth/vk-web";
function start(headers: Record<string, string> = {}) {
  return app.request(base + endpoint + "/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
}
function authorizedHeaders() {
  return { Origin: base, "X-Gafus-Auth-Transport": "cookie" };
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(process.env, {
    NODE_ENV: "development", WEB_APP_URL: base,
    VK_WEB_REDIRECT_URI: base + endpoint + "/callback", VK_CLIENT_ID: "12345",
    VK_WEB_COOKIE_SECRET: "test-only-hmac-secret-32-bytes-or-more-0000",
    API_PORT: "3001", API_HOST: "127.0.0.1",
    GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_LOCAL_BROWSER_AUTH: "1",
  });
  mock.createContext.mockResolvedValue(undefined);
  mock.context.mockResolvedValue({ codeVerifier: "synthetic-pkce-verifier" });
  mock.access.mockResolvedValue("dummy-access-token");
  mock.refresh.mockResolvedValue("dummy-refresh-token");
  mock.refreshSession.mockResolvedValue(undefined);
  mock.assertCompleted.mockResolvedValue(undefined);
  mock.claim.mockResolvedValue(undefined);
  mock.summary.mockResolvedValue({ selectedPromoCodeValue: null, completedAt: null });
});
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("Web VK ID PKCE entry is fail closed and secrets stay in HttpOnly cookies", () => {
  it("rejects requests without an explicit trusted browser Origin", async () => {
    expect((await start()).status).toBe(403);
    expect(mock.createContext).not.toHaveBeenCalled();
    expect((await start({ Origin: "https://evil.invalid", "X-Gafus-Auth-Transport": "cookie" })).status).toBe(403);
  });
  it("never starts a VK OAuth redirect without a configured callback", async () => {
    delete process.env.VK_WEB_REDIRECT_URI;
    const res = await start(authorizedHeaders());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "VK_WEB_UNAVAILABLE" });
    expect(mock.createContext).not.toHaveBeenCalled();
  });
  it("builds PKCE S256 and 5-minute signed HttpOnly nonce without exposing verifier", async () => {
    const res = await start(authorizedHeaders());
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-gafus_vk_nonce=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    const body = await res.json() as {data: {authorizeUrl: string}};
    const vk = new URL(body.data.authorizeUrl);
    expect(vk.origin).toBe("https://id.vk.ru");
    expect(vk.pathname).toBe("/authorize");
    expect(vk.searchParams.get("code_challenge_method")).toBe("S256");
    expect(vk.searchParams.get("client_id")).toBe("12345");
    expect(vk.searchParams.get("redirect_uri")).toBe(base + endpoint + "/callback");
    const stored = mock.createContext.mock.calls[0][0] as {codeVerifier: string;state: string};
    expect(vk.searchParams.get("state")).toBe(stored.state);
    expect(vk.searchParams.get("code_challenge")).toBeTruthy();
    expect(body.data.authorizeUrl).not.toContain(stored.codeVerifier);
    expect(cookie).not.toContain(stored.codeVerifier);
  });
  it("existing VK owner callback exchanges code only with matching signed nonce", async () => {
    mock.exchange.mockResolvedValue({
      user: { id: "owner-id", username: "owner", role: "USER" },
      requiresConsent: false,
    });
    const begin = await start(authorizedHeaders());
    const url = new URL((await begin.json() as {data:{authorizeUrl:string}}).data.authorizeUrl);
    const cookie = begin.headers.getSetCookie().find(v => v.startsWith("__Host-gafus_vk_nonce="));
    expect(cookie).toBeDefined();
    const callback = new URL(base + endpoint + "/callback");
    callback.searchParams.set("code", "only-test-code");
    callback.searchParams.set("device_id", "only-test-device");
    callback.searchParams.set("state", url.searchParams.get("state")!);
    const response = await app.request(callback.href, {headers:{Cookie:cookie!.split(";")[0]}});
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(base + "/courses");
    expect(mock.exchange).toHaveBeenCalledWith(expect.objectContaining({
      code: "only-test-code", codeVerifier: "synthetic-pkce-verifier", deviceId: "only-test-device",
    }));
    expect(mock.refreshSession).toHaveBeenCalledOnce();
    const cookies = response.headers.getSetCookie();
    expect(cookies.join(" ")).toContain("gafus_access=");
    expect(cookies.join(" ")).toContain("gafus_refresh=");
    expect(cookies.join(" ")).not.toContain("dummy-access-token; Path=/");
  });

  it("new VK user stays unauthenticated pending explicit three legal consents", async () => {
    mock.exchange.mockResolvedValue({
      user: { id: "new-id", username: "new", role: "USER" },
      requiresConsent: true,
    });
    const begin = await start(authorizedHeaders());
    const url = new URL((await begin.json() as {data:{authorizeUrl:string}}).data.authorizeUrl);
    const nonce = begin.headers.getSetCookie().find(v => v.startsWith("__Host-gafus_vk_nonce="));
    const callback = new URL(base + endpoint + "/callback");
    callback.searchParams.set("code", "synthetic-code");
    callback.searchParams.set("device_id", "synthetic-device");
    callback.searchParams.set("state", url.searchParams.get("state")!);
    const response = await app.request(callback.href, {headers:{Cookie:nonce!.split(";")[0]}});
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(base + "/vk-consent");
    expect(response.headers.getSetCookie().join(" ")).not.toContain("gafus_access=");
    const consentCookie = response.headers.getSetCookie()
      .find(v => v.startsWith("__Host-gafus_vk_consent="))!.split(";")[0];
    const context = await app.request(base + endpoint + "/consent", {headers:{Cookie:consentCookie}});
    expect(context.status).toBe(200);
    const rejected = await app.request(base + endpoint + "/consent", {
      method: "POST",
      headers: { "Content-Type":"application/json", Cookie:consentCookie, ...authorizedHeaders() },
      body: JSON.stringify({
        tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
        consentPayload: {acceptPersonalData:false,acceptPrivacyPolicy:true,acceptDataDistribution:true},
      }),
    });
    expect(rejected.status).toBe(400);
    expect(mock.complete).not.toHaveBeenCalled();
    mock.complete.mockResolvedValue({loginGrantToken:"synthetic-onetime-grant"});
    mock.grant.mockResolvedValue({userId:"new-id",username:"new",role:"USER"});
    const completed = await app.request(base + endpoint + "/consent", {
      method: "POST",
      headers: { "Content-Type":"application/json", Cookie:consentCookie, ...authorizedHeaders() },
      body: JSON.stringify({
        tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
        consentPayload: {acceptPersonalData:true,acceptPrivacyPolicy:true,acceptDataDistribution:true},
      }),
    });
    expect(completed.status).toBe(200);
    expect(mock.complete).toHaveBeenCalledOnce();
    expect(completed.headers.getSetCookie().join(" ")).toContain("gafus_access=");
  });

  it("does not exchange VK OAuth code if nonce or state is invalid", async () => {
    const res = await app.request(base + endpoint + "/callback?code=bad&state=bad&device_id=bad");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(base + "/login?error=vk_id_auth_failed");
    expect(mock.context).not.toHaveBeenCalled();
  });
});

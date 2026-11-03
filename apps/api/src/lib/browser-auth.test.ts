import { afterEach, describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  clearBrowserSession,
  getBrowserAccessToken,
  getBrowserRefreshToken,
  isBrowserCookieMode,
  isTrustedBrowserOrigin,
  setBrowserSession,
} from "./browser-auth";

const route = new Hono();
route.post("/session", (c) => {
  if (!isBrowserCookieMode(c) || !isTrustedBrowserOrigin(c)) return c.json({ error: "untrusted" }, 403);
  setBrowserSession(c, "signed-access-placeholder", "signed-refresh-placeholder");
  return c.json({ success: true });
});
route.get("/inspect", (c) => c.json({
  access: getBrowserAccessToken(c),
  refresh: getBrowserRefreshToken(c),
}));
route.post("/logout", (c) => {
  clearBrowserSession(c);
  return c.json({ success: true });
});

describe("browser auth cookie transport", () => {
  it("rejects missing/untrusted origin and native transport", async () => {
    const headers = { "x-gafus-auth-transport": "cookie" };
    expect((await route.request("/session", { method: "POST", headers })).status).toBe(403);
    expect((await route.request("/session", { method: "POST", headers: { ...headers, origin: "https://evil.example" } })).status).toBe(403);
    expect((await route.request("/session", { method: "POST", headers: { origin: "https://gafus.ru" } })).status).toBe(403);
  });

  it("issues two HttpOnly, Secure, SameSite cookies, without returning token strings", async () => {
    const res = await route.request("/session", {
      method: "POST",
      headers: { "x-gafus-auth-transport": "cookie", origin: "https://gafus.ru" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/api/v1");
    }
    expect(cookies.some((c) => c.startsWith("gafus_access="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("gafus_refresh="))).toBe(true);
  });

  it("reads cookie from HTTP header and clears it by path", async () => {
    const res = await route.request("/inspect", { headers: { cookie: "gafus_access=a; gafus_refresh=b" } });
    expect(await res.json()).toEqual({ access: "a", refresh: "b" });
    const logout = await route.request("/logout", { method: "POST" });
    expect(logout.headers.getSetCookie()).toHaveLength(2);
    expect(logout.headers.getSetCookie().every((value) => value.includes("Max-Age=0"))).toBe(true);
  });
});

// Local cookie sessions remain off unless the ORIGINAL API is explicitly
// isolated and an exact opt-in is present; production origins are not edited.
describe("isolated Refactor-only browser origin", () => {
  afterEach(() => vi.unstubAllEnvs());
  const local = { "x-gafus-auth-transport": "cookie", origin: "http://127.0.0.1:5173" };
  function enable() {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
    vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "1");
    vi.stubEnv("API_HOST", "127.0.0.1");
    vi.stubEnv("API_PORT", "3001");
  }

  it.each(["http://127.0.0.1:5174", "http://127.0.0.1:5175"])(
    "allows isolated staff-panel Origin %s with local HttpOnly cookies only",
    async (origin) => {
      const headers = { ...local, origin };
      expect((await route.request("/session", { method: "POST", headers })).status).toBe(403);
      enable();
      const response = await route.request("/session", { method: "POST", headers });
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toHaveLength(2);
      for (const cookie of response.headers.getSetCookie()) {
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("SameSite=Lax");
        expect(cookie).not.toContain("Secure");
      }
      vi.stubEnv("NODE_ENV", "production");
      expect((await route.request("/session", { method: "POST", headers })).status).toBe(403);
    },
  );

  it.each([
    ["GAFUS_LOCAL_ISOLATED_API", "0"],
    ["GAFUS_LOCAL_BROWSER_AUTH", "0"],
    ["API_HOST", "0.0.0.0"],
    ["API_PORT", "3003"],
  ])("rejects staff Origin when %s=%s", async (name, value) => {
    enable();
    vi.stubEnv(name, value);
    for (const origin of ["http://127.0.0.1:5174", "http://127.0.0.1:5175"]) {
      expect((await route.request("/session", {
        method: "POST", headers: { ...local, origin },
      })).status).toBe(403);
    }
  });

  it("denies local cookies by default, explicitly permits only attested local origin", async () => {
    expect((await route.request("/session", { method: "POST", headers: local })).status).toBe(403);
    enable();
    const allowed = await route.request("/session", { method: "POST", headers: local });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of allowed.headers.getSetCookie()) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).not.toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/api/v1");
    }
    const localLogout = await route.request("/logout", { method: "POST", headers: local });
    for (const cookie of localLogout.headers.getSetCookie()) {
      expect(cookie).not.toContain("Secure");
      expect(cookie).toContain("Max-Age=0");
    }
    for (const origin of [
      "http://localhost:5173", "http://127.0.0.1:5176",
      "http://127.0.0.1:5173.evil.example", "null", "https://evil.example",
    ]) {
      expect((await route.request("/session", {
        method: "POST", headers: { ...local, origin },
      })).status).toBe(403);
    }
    expect((await route.request("/session", {
      method: "POST", headers: { "x-gafus-auth-transport": "cookie" },
    })).status).toBe(403);
  });

  it("allows the same Vite origin on isolated Chat2 Hono 3003 only when fully opted in", async () => {
    enable();
    vi.stubEnv("API_PORT", "3003");
    const denied = await route.request("/session", { method: "POST", headers: local });
    expect(denied.status).toBe(403);
    vi.stubEnv("GAFUS_CHAT2_LOCAL_MANUAL_TEST", "1");
    expect((await route.request("/session", { method: "POST", headers: local })).status).toBe(403);
    vi.stubEnv("CHAT2_API_ENABLED", "enabled");
    const accepted = await route.request("/session", { method: "POST", headers: local });
    expect(accepted.status).toBe(200);
    for (const cookie of accepted.headers.getSetCookie()) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Secure");
    }
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5174", "null", "https://evil.example"]) {
      expect((await route.request("/session", {
        method: "POST", headers: { ...local, origin },
      })).status).toBe(403);
    }
    vi.stubEnv("GAFUS_CHAT2_LOCAL_MANUAL_TEST", "0");
    expect((await route.request("/session", { method: "POST", headers: local })).status).toBe(403);
    vi.stubEnv("GAFUS_CHAT2_LOCAL_MANUAL_TEST", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect((await route.request("/session", { method: "POST", headers: local })).status).toBe(403);
  });

  it("only exact isolated Web1 5373 + Hono 3301 opts into HTTP cookie", async () => {
    enable();
    vi.stubEnv("API_PORT", "3301");
    vi.stubEnv("GAFUS_WEB1_ALT_HONO", "1");
    const alt = { ...local, origin: "http://127.0.0.1:5373" };
    const response = await route.request("/session", { method: "POST", headers: alt });
    expect(response.status).toBe(200);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Secure");
    }
    const logout = await route.request("/logout", { method: "POST", headers: alt });
    expect(logout.headers.getSetCookie().every(cookie => !cookie.includes("Secure"))).toBe(true);
    vi.stubEnv("GAFUS_WEB1_ALT_HONO", "0");
    const blocked = await route.request("/session", { method: "POST", headers: alt });
    expect(blocked.status).toBe(403);
    vi.stubEnv("GAFUS_WEB1_ALT_HONO", "1");
    const wrong = await route.request("/session", { method: "POST", headers: local });
    expect(wrong.status).toBe(403);
    const prod = await route.request("/session", {
      method: "POST", headers: { ...alt, origin: "https://gafus.ru" },
    });
    expect(prod.headers.getSetCookie().every(cookie => cookie.includes("Secure"))).toBe(true);
  });

  it("all non-isolated or production browser origins retain Secure cookies", async () => {
    enable();
    const production = await route.request("/session", {
      method: "POST",
      headers: { ...local, origin: "https://gafus.ru" },
    });
    expect(production.status).toBe(200);
    expect(production.headers.getSetCookie().every(value => value.includes("Secure"))).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect((await route.request("/session", {
      method: "POST", headers: { ...local, origin: "https://gafus.ru" },
    })).headers.getSetCookie().every(value => value.includes("Secure"))).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "0");
    expect((await route.request("/session", {
      method: "POST", headers: { ...local, origin: "https://gafus.ru" },
    })).headers.getSetCookie().every(value => value.includes("Secure"))).toBe(true);
  });

  it("isolated Gallery 3601 accepts loopback browser cookies without Secure while preserving HttpOnly", async () => {
    enable();
    vi.stubEnv("API_PORT", "3601");
    vi.stubEnv("GAFUS_GALLERY_ISOLATED_HONO", "1");
    vi.stubEnv("GALLERY_ENABLED", "true");
    vi.stubEnv("FEED_ENABLED", "false");
    const result = await route.request("/session", { method: "POST", headers: local });
    expect(result.status).toBe(200);
    expect(result.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of result.headers.getSetCookie()) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/api/v1");
      expect(cookie).not.toContain("Secure");
    }
    const logout = await route.request("/logout", { method: "POST" });
    for (const cookie of logout.headers.getSetCookie())
      expect(cookie).not.toContain("Secure");
    vi.stubEnv("NODE_ENV", "production");
    const production = await route.request("/session", { method: "POST", headers: { ...local, origin: "https://gafus.ru" } });
    expect(production.headers.getSetCookie().every(cookie => cookie.includes("Secure"))).toBe(true);
  });

  it("denies even exact local origin if environment, opt-in, host or port is wrong", async () => {
    enable();
    for (const [key, value] of [
      ["NODE_ENV", "production"],
      ["GAFUS_LOCAL_ISOLATED_API", "0"],
      ["GAFUS_LOCAL_BROWSER_AUTH", "0"],
      ["API_HOST", "0.0.0.0"],
      ["API_PORT", "3000"],
    ]) {
      vi.stubEnv(key, value);
      expect((await route.request("/session", {
        method: "POST", headers: local,
      })).status).toBe(403);
      enable();
    }
  });
});

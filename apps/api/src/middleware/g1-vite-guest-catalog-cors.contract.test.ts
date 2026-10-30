import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_BROWSER_ORIGINS, corsMiddleware } from "./cors";

const origins = ["http://localhost:5173", "http://127.0.0.1:5173"];
function app() {
  const a = new Hono();
  a.use("*", corsMiddleware);
  a.get("/api/v1/public/courses", (c) => c.json({ success: true, data: [] }));
  a.get("/api/v1/private", (c) => c.json({ secret: "TEST_ONLY" }));
  a.post("/api/v1/public/courses", (c) => c.json({ success: false }, 405));
  return a;
}

describe("INFRA032: anonymous Vite guest catalog CORS is retired", () => {
  it.each(origins)(
    "denies anonymous GET and preflight for exact %s",
    async (origin) => {
      expect(ALLOWED_BROWSER_ORIGINS.has(origin)).toBe(false);
      const get = await app().request("/api/v1/public/courses", { headers: { Origin: origin } });
      expect(get.status).toBe(200);
      expect(get.headers.get("access-control-allow-origin")).not.toBe(origin);
      const preflight = await app().request("/api/v1/public/courses", {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
      });
      expect(preflight.headers.get("access-control-allow-origin")).not.toBe(origin);
    },
  );
  it.each(origins)(
    "never allows %s on protected GET or any POST/preflight mutation",
    async (origin) => {
      const cases = [
        ["/api/v1/private", "GET", undefined],
        ["/api/v1/public/courses", "POST", undefined],
        ["/api/v1/public/courses", "OPTIONS", "POST"],
      ] as const;
      for (const [path, method, preflightMethod] of cases) {
        const response = await app().request(path, {
          method,
          headers: {
            Origin: origin,
            ...(preflightMethod ? { "Access-Control-Request-Method": preflightMethod } : {}),
          },
        });
        expect(response.headers.get("access-control-allow-origin")).not.toBe(origin);
      }
    },
  );
  it("never reflects spoofed Vite 5173 origins and preserves HTTPS cookie origin", async () => {
    for (const origin of [
      "http://localhost:5173.evil.test",
      "http://127.0.0.1:51730",
      "https://localhost:5173",
      "null",
    ]) {
      const response = await app().request("/api/v1/public/courses", {
        headers: { Origin: origin },
      });
      expect(response.headers.get("access-control-allow-origin")).not.toBe(origin);
    }
    expect(ALLOWED_BROWSER_ORIGINS.has("https://gafus.ru")).toBe(true);
    const existing = await app().request("/api/v1/private", {
      headers: { Origin: "https://gafus.ru" },
    });
    expect(existing.headers.get("access-control-allow-origin")).toBe("https://gafus.ru");
    expect(existing.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("isolated Refactor opt-in credentialed CORS", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only exact loopback dev origin with all isolation settings", async () => {
    const origin = "http://127.0.0.1:5173";
    const denied = await app().request("/api/v1/private", { headers: { Origin: origin } });
    expect(denied.headers.get("access-control-allow-origin")).not.toBe(origin);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
    vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "1");
    vi.stubEnv("API_HOST", "127.0.0.1");
    vi.stubEnv("API_PORT", "3001");
    const protectedGet = await app().request("/api/v1/private", {
      headers: { Origin: origin },
    });
    expect(protectedGet.headers.get("access-control-allow-origin")).toBe(origin);
    expect(protectedGet.headers.get("access-control-allow-credentials")).toBe("true");
    const request = await app().request("/api/v1/private", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    expect(request.headers.get("access-control-allow-origin")).toBe(origin);
    expect(request.headers.get("access-control-allow-credentials")).toBe("true");
    for (const other of ["http://localhost:5173", "http://127.0.0.1:5174", "null"]) {
      const untrusted = await app().request("/api/v1/private", { headers: { Origin: other } });
      expect(untrusted.headers.get("access-control-allow-origin")).not.toBe(other);
    }
    vi.stubEnv("NODE_ENV", "production");
    const production = await app().request("/api/v1/private", { headers: { Origin: origin } });
    expect(production.headers.get("access-control-allow-origin")).not.toBe(origin);
  });
});

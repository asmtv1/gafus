/**
 * Matrix for browser-cookie CSRF and mobile Bearer auth on real Hono middleware.
 * Synthetic JWT identity only; no database, Redis or network connections.
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ verify: vi.fn(), registered: vi.fn() }));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: auth.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: auth.registered }));
import { authMiddleware } from "./auth";
import { corsMiddleware } from "./cors";

const cookie = { Cookie: "gafus_access=synthetic-valid-jwt" };
const trusted = "https://gafus.ru";
const untrusted = [
  undefined, "null", "https://attacker.example", "https://gafus.ru.attacker.example",
  "https://admin.gafus.ru", "https://dev.exp.direct", "http://127.0.0.1:5173",
];
function testApp() {
  const app = new Hono();
  app.use("*", corsMiddleware);
  app.use("*", authMiddleware);
  app.all("/api/v1/synthetic-private", c => c.json({ actorId: c.get("user")?.id }));
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.verify.mockResolvedValue({ id: "actor", username: "actor", role: "USER" });
  auth.registered.mockResolvedValue(true);
  // Exact production allowlist is unaffected by synthetic local preview gates.
  vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "0");
  vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("cookie Origin / CSRF versus explicit Bearer authorization", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "denies every untrusted cookie %s before querying user identity", async method => {
      const app = testApp();
      for (const origin of untrusted) {
        const response = await app.request("/api/v1/synthetic-private", {
          method, headers: { ...cookie, ...(origin === undefined ? {} : { Origin: origin }) },
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ success: false });
        expect(auth.verify).not.toHaveBeenCalled();
      }
    },
  );
  it("accepts trusted production browser Origin but never reflects a foreign CORS Origin", async () => {
    const app = testApp();
    const allowed = await app.request("/api/v1/synthetic-private", {
      method: "POST", headers: { ...cookie, Origin: trusted },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ actorId: "actor" });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(trusted);
    expect(allowed.headers.get("vary")?.toLowerCase()).toContain("origin");
    const blocked = await app.request("/api/v1/synthetic-private", {
      method: "POST", headers: { ...cookie, Origin: "https://gafus.ru.evil.example" },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("access-control-allow-origin")).not.toBe("https://gafus.ru.evil.example");
  });
  it("preserves explicit native Bearer mutations without browser Origin", async () => {
    const app = testApp();
    const response = await app.request("/api/v1/synthetic-private", {
      method: "PATCH", headers: { Authorization: "Bearer synthetic-mobile-token" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actorId: "actor" });
    expect(auth.verify).toHaveBeenCalledWith("synthetic-mobile-token");
  });
  it("denies cookie with missing credentials and ignores spoofed Basic auth", async () => {
    const app = testApp();
    expect((await app.request("/api/v1/synthetic-private", {
      method: "POST", headers: { Origin: trusted },
    })).status).toBe(401);
    expect((await app.request("/api/v1/synthetic-private", {
      method: "POST", headers: { ...cookie, Origin: trusted, Authorization: "Basic attacker" },
    })).status).toBe(401);
  });
});

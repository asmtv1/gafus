/**
 * G1 exact auth -> payments Redis-backed 10/min middleware -> unmounted Apple init.
 * Only the RedisStore is a scoped in-memory test double: the Hono limiter,
 * dispatch predicate, JWT authMiddleware and actual review route run for real.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerify, registration, init, errorLog } = vi.hoisted(() => ({
  jwtVerify: vi.fn(), registration: vi.fn(), init: vi.fn(), errorLog: vi.fn(),
}));

vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    counts = new Map<string, number>();
    init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
    async increment(key: string) {
      const totalHits = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement(key: string) {
      this.counts.set(key, Math.max(0, (this.counts.get(key) ?? 0) - 1));
    }
    async resetKey(key: string) { this.counts.delete(key); }
  },
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: jwtVerify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: registration }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  initializeAppleTokenForAuthenticatedOwner: init,
  AppleTokenOwnerUnavailableError: class AppleTokenOwnerUnavailableError extends Error {
    code = "APPLE_TOKEN_OWNER_UNAVAILABLE";
  },
}));
// Use REAL browser-auth cookie parsing and actual HTTPS ALLOWED_BROWSER_ORIGINS.
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: errorLog, info: vi.fn(), warn: vi.fn() }),
}));

import { authMiddleware } from "../../middleware/auth";
import { shouldRateLimitAppSubscriptionPath } from "../../middleware/app-subscription-rate-limit";
import { paymentsRateLimiter } from "../../middleware/rate-limit";
import { appleTokenInitializationReviewRoutes } from "./g1-apple-token-initialization.review";

const prefix = "/api/v1/app-subscription";
const initPath = `${prefix}/apple/token/initialize`;
function app() {
  const h = new Hono();
  h.use(`${prefix}/*`, async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  h.use(`${prefix}/*`, authMiddleware);
  h.use(`${prefix}/*`, (c, next) => {
    const { pathname } = new URL(c.req.url);
    return shouldRateLimitAppSubscriptionPath(c.req.method, pathname)
      ? paymentsRateLimiter(c, next) : next();
  });
  h.route(prefix, appleTokenInitializationReviewRoutes);
  return h;
}

function bearer(id: string) {
  return { authorization: `Bearer ${id}` };
}

describe("G1 Apple Phase A: actual Hono payments limiter dispatch behind auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jwtVerify.mockImplementation(async (token: string) =>
      token === "invalid" ? null : { id: token, username: "synthetic", role: "USER" },
    );
    registration.mockResolvedValue(true);
    init.mockImplementation(async (id: string) => ({ appleAppAccountToken: `persisted-${id}` }));
  });

  it("10 POSTs allowed for one JWT owner then exact 11th gets private 429, no DB init", async () => {
    const h = app();
    for (let i = 0; i < 10; i++) {
      const res = await h.request(initPath, { method: "POST", headers: bearer("rate-owner-a") });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(init).toHaveBeenCalledTimes(10);
    const rejected = await h.request(initPath, { method: "POST", headers: bearer("rate-owner-a") });
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("cache-control")).toBe("private, no-store");
    expect(rejected.headers.get("ratelimit-limit")).toBe("10");
    expect(init).toHaveBeenCalledTimes(10);
    expect(await rejected.text()).not.toContain("persisted-");
  });

  it("quota is keyed to authenticated owner, not spoofed JSON/header/IP", async () => {
    const h = app();
    for (let i = 0; i < 10; i++) {
      const res = await h.request(initPath, {
        method: "POST",
        headers: { ...bearer("rate-owner-b"), "x-real-ip": `rotating-${i}`, "content-type": "application/json" },
        body: JSON.stringify({ userId: "rate-owner-c", appleAppAccountToken: "attacker" }),
      });
      expect(res.status).toBe(200);
    }
    const blocked = await h.request(initPath, {
      method: "POST", headers: { ...bearer("rate-owner-b"), "x-real-ip": "rotated-again" },
    });
    expect(blocked.status).toBe(429);
    expect((await h.request(initPath, { method: "POST", headers: bearer("rate-owner-c") })).status)
      .toBe(200);
    expect(init).toHaveBeenLastCalledWith("rate-owner-c");
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("no JWT and cookie invalid Origin fail BEFORE consuming limit or touching DB", async () => {
    const h = app();
    expect((await h.request(initPath, { method: "POST" })).status).toBe(401);
    for (const origin of [undefined, "null", "https://evil.example"]) {
      const res = await h.request(initPath, {
        method: "POST",
        headers: { cookie: "gafus_access=jwt", ...(origin ? { origin } : {}) },
      });
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(init).not.toHaveBeenCalled();
    const allowed = await h.request(initPath, {
      method: "POST", headers: { cookie: "gafus_access=jwt", origin: "https://gafus.ru" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("ratelimit-remaining")).toBe("9");
    expect(init).toHaveBeenCalledExactlyOnceWith("jwt");
  });

  it("invalid explicit Bearer never falls back to a valid ambient browser cookie", async () => {
    const h = app();
    const res = await h.request(initPath, {
      method: "POST", headers: {
        authorization: "Bearer invalid",
        cookie: "gafus_access=cookie-jwt",
        origin: "https://gafus.ru",
      },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(init).not.toHaveBeenCalled();
  });

  it("unregistered identity, malformed bearer and provider secret error never leak", async () => {
    const h = app();
    const malformed = await h.request(initPath, {
      method: "POST", headers: { authorization: "Basic non-jwt" },
    });
    expect(malformed.status).toBe(401);
    expect(malformed.headers.get("cache-control")).toBe("private, no-store");
    registration.mockResolvedValueOnce(false);
    const pending = await h.request(initPath, {
      method: "POST", headers: bearer("unregistered") },
    );
    expect(pending.status).toBe(401);
    expect(init).not.toHaveBeenCalled();
    init.mockRejectedValueOnce(new Error("SENSITIVE_APPLE_DB_VALUE_123"));
    const internal = await h.request(initPath, { method: "POST", headers: bearer("new-owner") });
    expect(internal.status).toBe(500);
    expect(internal.headers.get("cache-control")).toBe("private, no-store");
    expect(await internal.text()).not.toContain("SENSITIVE_APPLE_DB_VALUE_123");
    expect(errorLog).not.toHaveBeenCalled();
  });
});

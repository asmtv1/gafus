/** AG4-approved Phase A: LIVE app router composition; providers/RedisStore synthetic only. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerify, registration, initialize, legacyOffer } = vi.hoisted(() => ({
  jwtVerify: vi.fn(), registration: vi.fn(), initialize: vi.fn(), legacyOffer: vi.fn(),
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
vi.mock("@gafus/auth/jwt", async (importOriginal) => ({
  ...await importOriginal<object>(), verifyAccessToken: jwtVerify,
}));
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(), isRegistrationCompleted: registration,
}));
vi.mock("@gafus/core/services/appSubscription", async (importOriginal) => ({
  ...await importOriginal<object>(), initializeAppleTokenForAuthenticatedOwner: initialize,
  getAppSubscriptionOffer: legacyOffer,
}));

import { app } from "../../app";

const initPath = "/api/v1/app-subscription/apple/token/initialize";
function bearer(actor: string) { return { authorization: `Bearer ${actor}` }; }

beforeEach(() => {
  vi.clearAllMocks();
  jwtVerify.mockImplementation(async (token: string) =>
    token === "invalid" ? null : { id: token, username: "synthetic", role: "USER" },
  );
  registration.mockResolvedValue(true);
  legacyOffer.mockResolvedValue({
    appleAppAccountToken: "47b26361-eb4b-4f0a-99b5-b990ca58201f",
    plans: [], clientContext: "synthetic-legacy-offer",
  });
  initialize.mockImplementation(async (id: string) => ({
    appleAppAccountToken: id === "phasea-a" ? "47b26361-eb4b-4f0a-99b5-b990ca58201f" :
      "fca0aa94-e73d-45c0-9790-a628d7aa9dce",
  }));
});

describe("AG4 Phase A mounted actual app router (no real provider/DB)", () => {
  it("additive mounted POST 200, JWT owner-only even on attacker body", async () => {
    const result = await app.request(initPath, {
      method: "POST", headers: { ...bearer("phasea-a"), "content-type": "application/json" },
      body: JSON.stringify({ userId: "phasea-b", appleAppAccountToken: "attacker" }),
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toEqual({ success: true, data: {
      appleAppAccountToken: "47b26361-eb4b-4f0a-99b5-b990ca58201f",
    } });
    expect(initialize).toHaveBeenCalledWith("phasea-a");
  });

  it("actual API rejects absent/bad JWT and cookie untrusted Origin before DB", async () => {
    expect((await app.request(initPath, { method: "POST" })).status).toBe(401);
    expect((await app.request(initPath, { method: "POST", headers: bearer("invalid") })).status).toBe(401);
    for (const origin of [undefined, "https://evil.example"]) {
      const result = await app.request(initPath, { method: "POST", headers: {
        cookie: "gafus_access=cookie-session", ...(origin ? { origin } : {}),
      } });
      expect(result.status).toBe(403);
      expect(result.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(initialize).not.toHaveBeenCalled();
    const accepted = await app.request(initPath, { method: "POST", headers: {
      cookie: "gafus_access=cookie-session", origin: "https://gafus.ru",
    } });
    expect(accepted.status).toBe(200);
    expect(initialize).toHaveBeenLastCalledWith("cookie-session");
  });

  it("11th rate-limited POST 429; other JWT owner retains quota", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await app.request(initPath, { method: "POST", headers: bearer("phasea-rate-x") })).status)
        .toBe(200);
    }
    const limited = await app.request(initPath, { method: "POST", headers: bearer("phasea-rate-x") });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    expect(limited.headers.get("ratelimit-limit")).toBe("10");
    expect(initialize).toHaveBeenCalledTimes(10);
    expect((await app.request(initPath, { method: "POST", headers: bearer("phasea-rate-y") })).status)
      .toBe(200);
    expect(initialize).toHaveBeenLastCalledWith("phasea-rate-y");
  });

  it("legacy GET /offer still calls original writable helper and returns token DTO", async () => {
    const response = await app.request("/api/v1/app-subscription/offer", {
      method: "GET", headers: bearer("phasea-legacy"),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ success: true, data: {
      appleAppAccountToken: "47b26361-eb4b-4f0a-99b5-b990ca58201f",
      plans: [], clientContext: "synthetic-legacy-offer",
    } });
    expect(legacyOffer).toHaveBeenCalledWith("phasea-legacy", expect.any(Object));
    expect(initialize).not.toHaveBeenCalled();
  });

  it("provider/store error sanitized without exposing secrets and no-store preserved", async () => {
    initialize.mockRejectedValueOnce(new Error("AG1_PRIVATE_TOKEN_NEVER_RETURN"));
    const response = await app.request(initPath, { method: "POST", headers: bearer("phasea-error") });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("AG1_PRIVATE_TOKEN_NEVER_RETURN");
  });
});

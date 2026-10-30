import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerify, registration, init } = vi.hoisted(() => ({
  jwtVerify: vi.fn(), registration: vi.fn(), init: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: jwtVerify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: registration }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  initializeAppleTokenForAuthenticatedOwner: init,
  AppleTokenOwnerUnavailableError: class AppleTokenOwnerUnavailableError extends Error {
    code = "APPLE_TOKEN_OWNER_UNAVAILABLE";
  },
}));
vi.mock("../../lib/browser-auth.js", () => ({
  getBrowserAccessToken: (c: { req: { header: (header: string) => string | undefined } }) =>
    c.req.header("cookie")?.includes("gafus_access=") ? "cookie-jwt" : undefined,
  isTrustedBrowserOrigin: (c: { req: { header: (header: string) => string | undefined } }) =>
    c.req.header("origin") === "https://approved.example",
}));

import { authMiddleware } from "../../middleware/auth";
import { appleTokenInitializationReviewRoutes } from "./g1-apple-token-initialization.review";

function testApp() {
  const app = new Hono();
  app.use("/api/v1/app-subscription/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  app.use("/api/v1/app-subscription/*", authMiddleware);
  app.route("/api/v1/app-subscription", appleTokenInitializationReviewRoutes);
  return app;
}

const path = "https://localhost/api/v1/app-subscription/apple/token/initialize";

describe("G1 Apple init review route (not mounted in live API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registration.mockResolvedValue(true);
    jwtVerify.mockResolvedValue({ id: "owner-a", role: "USER", username: "owner" });
    init.mockResolvedValue({ appleAppAccountToken: "persisted-apple-uuid" });
  });

  it("Bearer Expo POST resolves only JWT owner; ignores spoofed owner in JSON", async () => {
    const res = await testApp().request(path, {
      method: "POST", headers: { authorization: "Bearer mobile-jwt", "content-type": "application/json" },
      body: JSON.stringify({ userId: "owner-b", appleAppAccountToken: "fake" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      success: true, data: { appleAppAccountToken: "persisted-apple-uuid" },
    });
    expect(init).toHaveBeenCalledExactlyOnceWith("owner-a");
  });

  it("cookie POST rejects absent/untrusted Origin before token creation", async () => {
    for (const origin of [undefined, "https://evil.example"]) {
      const res = await testApp().request(path, {
        method: "POST", headers: {
          cookie: "gafus_access=cookie-jwt",
          ...(origin ? { origin } : {}),
        },
      });
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(init).not.toHaveBeenCalled();
  });

  it("trusted cookie Origin authorizes init; unauthenticated Bearer 401 is private", async () => {
    const authorized = await testApp().request(path, {
      method: "POST", headers: { cookie: "gafus_access=cookie-jwt", origin: "https://approved.example" },
    });
    expect(authorized.status).toBe(200);
    jwtVerify.mockResolvedValueOnce(null);
    const denied = await testApp().request(path, { method: "POST", headers: { authorization: "Bearer bad" } });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
  });

  it("session owner change on separate JWT cannot reuse previous owner token", async () => {
    const app = testApp();
    await app.request(path, { method: "POST", headers: { authorization: "Bearer owner-a" } });
    jwtVerify.mockResolvedValueOnce({ id: "owner-b", username: "other", role: "USER" });
    init.mockResolvedValueOnce({ appleAppAccountToken: "owner-b-token" });
    const next = await app.request(path, { method: "POST", headers: { authorization: "Bearer owner-b" } });
    expect(await next.json()).toEqual({ success: true, data: { appleAppAccountToken: "owner-b-token" } });
    expect(init).toHaveBeenLastCalledWith("owner-b");
  });

  it("internal errors never print source error or token in response", async () => {
    init.mockRejectedValueOnce(new Error("private-pg-apple-secret"));
    const res = await testApp().request(path, { method: "POST", headers: { authorization: "Bearer mobile" } });
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).not.toContain("private-pg-apple-secret");
  });
});

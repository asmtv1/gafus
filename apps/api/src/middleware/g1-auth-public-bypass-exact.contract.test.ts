/**
 * AG1-SEC-080: JWT can be skipped only for documented, exact public URLs.
 * This mounts the real authMiddleware around a synthetic protected handler,
 * with isolated identity stubs: no database, Redis, workers or server startup.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  verify: vi.fn(),
  completed: vi.fn(),
  cookieToken: vi.fn(),
  trustedOrigin: vi.fn(),
}));

vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: auth.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: auth.completed }));
vi.mock("../lib/browser-auth.js", () => ({
  getBrowserAccessToken: auth.cookieToken,
  isTrustedBrowserOrigin: auth.trustedOrigin,
}));

import { authMiddleware } from "./auth";

function testApp() {
  const app = new Hono();
  app.use("*", authMiddleware);
  // A synthetic protected endpoint deliberately shares prefix with public ones:
  // a 200 without JWT here reveals an over-broad middleware exemption.
  app.all("*", (c) => c.json({ success: true, user: c.get("user")?.id ?? null }));
  return app;
}

describe("AG1-SEC-080 exact public auth exceptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.cookieToken.mockReturnValue(undefined);
    auth.verify.mockResolvedValue(null);
    auth.completed.mockResolvedValue(true);
  });

  it.each([
    "/api/v1/user/profile/public?username=alice",
    "/user/profile/public?username=alice",
    "/profile/public?username=alice",
    "/api/v1/public/mobile-app",
    "/public/mobile-app",
    "/api/v1/training/video/video-1/manifest.m3u8?token=signed",
    "/api/v1/training/video/video-1/manifest?token=signed",
    "/api/v1/training/video/video-1/segment?path=chunk.ts&token=signed",
  ])("allows exactly documented GET public path: %s", async (url) => {
    const result = await testApp().request(url);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, user: null });
    expect(auth.verify).not.toHaveBeenCalled();
  });

  it.each([
    "/api/v1/user/profile/publicity",
    "/api/v1/user/profile/public/private",
    "/api/v1/user/profile/publications",
    "/api/v1/user/not-profile/public",
    "/api/v1/pets/user/profile/public",
    "/api/v1/public/mobile-app/configure",
    "/api/v1/public/mobile-app-v2",
    "/api/v1/pets/public/mobile-app",
    "/api/v1/training/video/video-1/progress",
    "/api/v1/training/video/video-1/manifest.m3u8/extra",
    "/api/v1/training/video/video-1/segment/extra",
  ])("requires JWT for sibling/malicious prefix GET %s", async (url) => {
    const result = await testApp().request(url);
    expect(result.status).toBe(401);
    expect(await result.json()).toMatchObject({ success: false });
  });

  it.each([
    "/api/v1/user/profile/public",
    "/api/v1/public/mobile-app",
    "/api/v1/training/video/video-1/manifest.m3u8?token=signed",
    "/api/v1/training/video/video-1/segment?token=signed",
  ])("does not bypass JWT for mutating POST %s", async (url) => {
    const result = await testApp().request(url, { method: "POST" });
    expect(result.status).toBe(401);
  });

  it("preserves bearer authentication for a protected sibling", async () => {
    auth.verify.mockResolvedValue({ id: "test-user", role: "USER", username: "tester" });
    const result = await testApp().request("/api/v1/user/profile/publications", {
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, user: "test-user" });
    expect(auth.verify).toHaveBeenCalledWith("valid-token");
    expect(auth.completed).toHaveBeenCalledWith("test-user");
  });
});

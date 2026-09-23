import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMobileFeatureFlagEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_VK_LOGIN_IOS: "mobile_vk_login_ios",
  getMobileFeatureFlagEnabled: getMobileFeatureFlagEnabledMock,
}));

import { jsonRequest } from "../../test/route-test-utils";
import { authRoutes } from "./auth";

function createTestApp() {
  const app = new Hono();
  app.route("/api/v1/auth", authRoutes);
  return app;
}

describe("auth route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMobileFeatureFlagEnabledMock.mockResolvedValue(true);
  });

  it("rejects invalid login payloads before calling auth services", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/auth/login", "POST", {
        username: "",
        password: "",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("blocks VK login for a disabled iOS review profile", async () => {
    const app = createTestApp();
    getMobileFeatureFlagEnabledMock.mockResolvedValueOnce(false);
    const response = await app.request(
      jsonRequest(
        "/api/v1/auth/vk",
        "POST",
        {
          code: "vk-code",
          code_verifier: "v".repeat(43),
          device_id: "device-1",
          state: "s".repeat(32),
          platform: "ios",
        },
        {
          "x-client-platform": "ios",
          "x-client-version": "1.6.9",
        },
      ),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });
});

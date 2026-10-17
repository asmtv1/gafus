import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMobileFeatureFlagEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_VK_LOGIN_IOS: "mobile_vk_login_ios",
  getMobileFeatureFlagEnabled: getMobileFeatureFlagEnabledMock,
}));

const registerMock = vi.hoisted(() => vi.fn());
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(),
  registerUserService: registerMock,
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

  it.each(["WEB", "IOS", "ANDROID"])("preserves DNS rejection text for %s direct API", async (registrationChannel) => {
    const error = "Почта с доменом @qwe.ru не принимает письма. Укажите настоящий адрес электронной почты";
    registerMock.mockResolvedValueOnce({ error });
    const response = await createTestApp().request(jsonRequest("/api/v1/auth/register", "POST", {
      name: "new_user", email: "new@qwe.ru", password: "Password1x", registrationChannel,
      tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
      consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error });
    expect(registerMock).toHaveBeenCalledWith("new_user", "new@qwe.ru", "Password1x", registrationChannel, undefined, expect.objectContaining({ consentPayload: expect.any(Object) }));
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
          "x-client-version": "1.7.1",
        },
      ),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });
});

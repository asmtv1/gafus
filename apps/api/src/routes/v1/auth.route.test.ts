import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(registerMock).toHaveBeenCalledWith(
      "new_user", "new@qwe.ru", "Password1x", registrationChannel, undefined,
      expect.objectContaining({ consentPayload: expect.any(Object) }),
      expect.objectContaining({ withRegistrationTransaction: expect.any(Function) }),
      expect.objectContaining({ readRegistrationPromoRowTx: expect.any(Function) }),
    );
  });

  it("never reflects internal registration errors to unauthenticated clients", async () => {
    registerMock.mockRejectedValueOnce(new Error("DB_CONNECTION_STRING_AND_INTERNAL_DETAILS"));
    const response = await createTestApp().request(jsonRequest("/api/v1/auth/register", "POST", {
      name: "new_user", email: "new@example.test", password: "Password1x",
      registrationChannel: "WEB",
      tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
      consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
    }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false, code: "REGISTRATION_UNAVAILABLE",
      error: "Не удалось зарегистрироваться. Попробуйте позже.",
    });
    expect(JSON.stringify(body)).not.toContain("DB_CONNECTION_STRING");
  });

  it("fails closed for legacy phone-match; never reports arbitrary ownership", async () => {
    const response = await createTestApp().request(jsonRequest("/api/v1/auth/check-phone-match", "POST", {
      username: "target-user", phone: "+79991234567",
    }));
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      success: false, code: "PHONE_MATCH_UNAVAILABLE",
      error: "Проверка номера недоступна. Восстановите доступ через email.",
    });
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

  it.each([
    ["/vk", "POST"],
    ["/vk-consent", "POST"],
    ["/vk-link", "POST"],
    ["/vk-phone-set", "POST"],
    ["/vk-consent/old-token", "GET"],
  ])("retires %s with a stable recovery hint, not OAuth", async (route, method) => {
    const response = await createTestApp().request(
      jsonRequest(`/api/v1/auth${route}`, method, method === "GET" ? undefined : {}),
    );
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: "VK_AUTH_RETIRED" });
    expect(body.error).toContain("Восстановите пароль");
    expect(JSON.stringify(body)).not.toContain("code_verifier");
  });
});

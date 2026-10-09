import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@gafus/core/services/auth", () => ({
  registerUserService: mocks.register,
  REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE: "Пользователь с такими данными уже существует",
}));
vi.mock("@shared/lib/rateLimit", () => ({
  checkAuthRateLimit: mocks.rateLimit,
  getClientIp: () => "192.0.2.1",
  RATE_LIMIT_RETRY_AFTER_SECONDS: 900,
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));

import { POST } from "./route";

const body = {
  name: "new_user",
  email: "new@qwe.ru",
  password: "Password1x",
  registrationChannel: "WEB",
  tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
  consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
};
const request = () => new NextRequest("https://example.com/api/v1/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1", "user-agent": "registration-test" },
  body: JSON.stringify(body),
});

describe("web registration API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rateLimit.mockReturnValue(true);
  });

  it("passes consent context once and returns registration success", async () => {
    mocks.register.mockResolvedValue({ success: true, userId: "user-1" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { success: true, userId: "user-1" } });
    expect(mocks.register).toHaveBeenCalledExactlyOnceWith(
      body.name, body.email, body.password, "WEB", undefined,
      expect.objectContaining({
        tempSessionId: body.tempSessionId,
        consentPayload: body.consentPayload,
        formData: { name: body.name, email: body.email },
        ipAddress: "192.0.2.1",
        userAgent: "registration-test",
        defaultVersion: expect.any(String),
      }),
    );
  });

  it("preserves the rejected email domain in the public error", async () => {
    const error = "Почта с доменом @qwe.ru не принимает письма. Укажите настоящий адрес электронной почты";
    mocks.register.mockResolvedValue({ error });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error });
  });

  it("handles a registration exception with the outer catch", async () => {
    mocks.register.mockRejectedValue(new Error("consent persistence failed"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
  });
});

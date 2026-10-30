import { beforeEach, describe, expect, it, vi } from "vitest";

const tracer = vi.hoisted(() => ({ reportClientError: vi.fn(), addTracerBreadcrumb: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.7.0" }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://fixture.invalid",
  NETWORK_TIMEOUTS: { request: 20_000 },
}));
vi.mock("@/shared/lib/tracer", () => tracer);

import { authApi } from "./auth";

const user = { id: "fixture-user", username: "user", role: "USER" };
const wireData = {
  success: true,
  data: { user, accessToken: "fixture-access", refreshToken: "fixture-refresh" },
};
const normalized = {
  ...wireData, data: { ...wireData.data, user: { phone: null, email: null, ...user } },
};
function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: () => "application/json" },
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("AG3 G1 native auth DTO (mock-only)", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("__DEV__", false); });

  it("login uses native JSON and no browser cookie mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue(response(200, wireData));
    vi.stubGlobal("fetch", mockFetch);
    expect(await authApi.login("user", "fixture-pass")).toEqual(normalized);
    expect(mockFetch.mock.calls[0][0]).toBe("https://fixture.invalid/api/v1/auth/login");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "X-Client-Platform": "android", "X-Client-Version": "1.7.0",
      }),
    });
    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty("X-Gafus-Auth-Transport");
  });

  it("register sends native channel, consent and receives native token envelope", async () => {
    const mockFetch = vi.fn().mockResolvedValue(response(200, wireData));
    vi.stubGlobal("fetch", mockFetch);
    const consent = {
      acceptPersonalData: true,
      acceptPrivacyPolicy: true,
      acceptDataDistribution: false,
    };
    expect(await authApi.register(
      "Анна", "fixture@example.invalid", "fixture-pass",
      "fixture-session", consent, "ANDROID",
    )).toEqual(normalized);
    expect(mockFetch.mock.calls[0][0]).toBe("https://fixture.invalid/api/v1/auth/register");
    const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      name: "Анна", email: "fixture@example.invalid", tempSessionId: "fixture-session",
      registrationChannel: "ANDROID", consentPayload: consent,
    });
  });

  it("login 401 preserves explicit error code fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401, {
      success: false, error: "Неверные учётные данные",
    })));
    expect(await authApi.login("user", "invalid")).toMatchObject({
      success: false, code: "HTTP_401",
    });
  });

  it("registration 409 preserves conflict response code fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(409, {
      success: false, error: "Такой пользователь уже существует",
    })));
    expect(await authApi.register(
      "Анна", "fixture@example.invalid", "fixture-pass",
      "fixture-session",
      {
        acceptPersonalData: true,
        acceptPrivacyPolicy: true,
        acceptDataDistribution: false,
      }, "ANDROID",
    )).toMatchObject({ success: false, code: "HTTP_409" });
  });
});

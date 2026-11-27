import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(),
}));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.7.5" }));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://api.test", NETWORK_TIMEOUTS: { request: 20_000 },
}));
vi.mock("@/shared/lib/error-reporting", () => ({
  reportClientError: vi.fn(), addTracerBreadcrumb: vi.fn(),
}));
import { authApi } from "./auth";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("password reset request deadline", () => {
  it("settles even when native fetch never resolves after abort", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const result = authApi.sendPasswordResetRequest("test@example.test");
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toMatchObject({ success: false, code: "REQUEST_TIMEOUT" });
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not wait for unused success response body", async () => {
    const json = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));
    await expect(authApi.sendPasswordResetRequest("test@example.test")).resolves.toEqual({ success: true });
    expect(json).not.toHaveBeenCalled();
  });
  it("bounds a hanging error response body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 503, headers: { get: () => "application/json" },
      json: () => new Promise(() => {}),
    }));
    const result = authApi.sendPasswordResetRequest("test@example.test");
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toMatchObject({ success: false, code: "REQUEST_TIMEOUT" });
  });
  it("preserves a structured server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 429, headers: { get: () => "application/json" },
      json: async () => ({ error: "Повторите позже", code: "RATE_LIMIT" }),
    }));
    await expect(authApi.sendPasswordResetRequest("test@example.test")).resolves.toEqual({
      success: false, error: "Повторите позже", code: "RATE_LIMIT",
    });
  });
});

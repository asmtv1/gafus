import { afterEach, describe, expect, it, vi } from "vitest";

const { errorReport } = vi.hoisted(() => ({ errorReport: vi.fn() }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(),
}));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.7.0" }));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://api.test", NETWORK_TIMEOUTS: { request: 20_000 },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: errorReport, addTracerBreadcrumb: vi.fn(),
}));
import { authApi } from "./auth";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("real native logout transport deadline", () => {
  it("sends native refresh token in the body and returns only confirmed success", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetcher);
    expect(await authApi.logout("private-refresh")).toEqual({ success: true });
    expect(fetcher).toHaveBeenCalledWith("https://api.test/api/v1/auth/logout", expect.objectContaining({
      method: "POST", body: JSON.stringify({ refreshToken: "private-refresh" }),
      signal: expect.any(AbortSignal),
    }));
  });

  it("aborts an offline request after eight seconds without claiming revocation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const running = authApi.logout("offline-refresh");
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(running).resolves.toMatchObject({ success: false });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(errorReport).toHaveBeenCalledOnce();
  });

  it("never acknowledges HTTP503 as successful logout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(authApi.logout("server-unavailable")).resolves.toMatchObject({ success: false });
  });
});

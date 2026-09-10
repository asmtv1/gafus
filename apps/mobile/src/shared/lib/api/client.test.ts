import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteItemAsyncMock, getItemAsyncMock, reportClientErrorMock, setItemAsyncMock } =
  vi.hoisted(() => ({
    deleteItemAsyncMock: vi.fn(),
    getItemAsyncMock: vi.fn(),
    reportClientErrorMock: vi.fn(),
    setItemAsyncMock: vi.fn(),
  }));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: deleteItemAsyncMock,
  getItemAsync: getItemAsyncMock,
  setItemAsync: setItemAsyncMock,
}));

vi.mock("expo-application", () => ({
  nativeApplicationVersion: "1.6.8",
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://api.test",
  NETWORK_TIMEOUTS: { request: 20_000 },
}));

vi.mock("@/shared/lib/tracer", () => ({
  addTracerBreadcrumb: vi.fn(),
  reportClientError: reportClientErrorMock,
}));

import { apiClient } from "./client";

function makeResponse(status: number, body: unknown = { success: false }): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe("apiClient auth refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemAsyncMock.mockImplementation(async (key: string) => {
      if (key === "auth_token") return "access-token";
      if (key === "refresh_token") return "refresh-token";
      return null;
    });
  });

  it("returns timeout instead of expiring the session when refresh is aborted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(401))
      .mockRejectedValueOnce(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient("/api/v1/user/profile");

    expect(result).toMatchObject({
      success: false,
      code: "REQUEST_TIMEOUT",
    });
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.test/api/v1/user/profile",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Client-Platform": "ios",
          "X-Client-Version": "1.6.8",
        }),
      }),
    );
  });
});

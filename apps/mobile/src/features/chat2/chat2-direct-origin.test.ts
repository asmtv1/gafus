import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  apiClient: vi.fn(),
  state: {
    isAuthenticated: true,
    isLoading: false,
    user: { id: "sender" },
  },
}));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: mock.apiClient }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("@/shared/lib/api/client-context", () => ({ getMobileClientHeaders: () => ({}) }));
vi.mock("@/shared/stores", () => ({
  useAuthStore: { getState: () => mock.state },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: "sender", authEpoch: "dev-epoch" }),
  },
}));
import { chat2 } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "http://127.0.0.1:3003");
  mock.apiClient.mockResolvedValue({
    success: true, data: { conversationId: "direct-room" },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Native Chat2 isolated API and direct-profile messaging", () => {
  it("opens the specified recipient via the dedicated Refactor chat origin", async () => {
    expect(await chat2.directByUsername("teamb"))
      .toEqual({ conversationId: "direct-room" });
    expect(mock.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/chats/direct",
      expect.objectContaining({
        method: "POST",
        body: { username: "teamb" },
        chat2Origin: "http://127.0.0.1:3003",
        skipAuthRefreshReplay: true,
      }),
    );
  });

  it("keeps existing direct-by-ID callers working", async () => {
    await chat2.direct("target");
    expect(mock.apiClient).toHaveBeenCalledWith(
      "/api/v1/chats/direct",
      expect.objectContaining({
        body: { userId: "target" },
        chat2Origin: "http://127.0.0.1:3003",
      }),
    );
  });

  it("rejects malformed usernames before making a request", async () => {
    expect(() => chat2.directByUsername("../bad")).toThrow();
    expect(mock.apiClient).not.toHaveBeenCalled();
  });

  it("fails closed when the explicit Chat2 origin is missing or production", async () => {
    for (const origin of ["", "https://api.gafus.ru", "http://somewhere.example"]) {
      vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", origin);
      await expect(chat2.directByUsername("teamb")).rejects.toThrow();
    }
    expect(mock.apiClient).not.toHaveBeenCalled();
  });

  it("uses V2 reserve rather than the legacy multipart endpoint in release builds", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_CHAT2_API_ORIGIN", "https://chat2-refactor.example");
    vi.stubEnv("EXPO_PUBLIC_CHAT2_MEDIA_V2", "false");
    mock.apiClient.mockResolvedValueOnce({
      success: false,
      error: "V2 is not available",
    });
    await expect(chat2.upload("room_1", {
      uri: "file:///image.png", name: "image.png", mime: "image/png", size: 128,
    })).rejects.toThrow("V2 is not available");
    expect(mock.apiClient).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/chats/room_1/media/v2/reserve",
      expect.objectContaining({
        method: "POST",
        body: { name: "image.png", mime: "image/png", bytes: 128 },
        chat2Origin: "https://chat2-refactor.example",
      }),
    );
  });

  it("does not expose PDF to a public release-bucket or legacy upload", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_CHAT2_MEDIA_V2", "true");
    await expect(chat2.upload("room_1", {
      uri: "file:///document.pdf", name: "document.pdf", mime: "application/pdf", size: 128,
    })).rejects.toThrow("PDF в чате пока недоступен");
    expect(mock.apiClient).not.toHaveBeenCalled();
  });

  it("routes room token refresh to the same isolated chat origin", async () => {
    mock.apiClient.mockResolvedValueOnce({
      success: true, data: { token: "isolated-token", channel: "isolated-room" },
    });
    expect(await chat2.refreshSubscription("direct-room")).toBe("isolated-token");
    expect(mock.apiClient).toHaveBeenCalledWith(
      "/api/v1/chats/direct-room/realtime",
      expect.objectContaining({ chat2Origin: "http://127.0.0.1:3003" }),
    );
  });
});

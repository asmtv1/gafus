import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authApiMock,
  deleteItemAsyncMock,
  getItemAsyncMock,
  identifyUserMock,
  resetAnalyticsUserMock,
  resetUserStoresMock,
} = vi.hoisted(() => ({
  authApiMock: {
    getProfile: vi.fn(),
  },
  deleteItemAsyncMock: vi.fn(),
  getItemAsyncMock: vi.fn(),
  identifyUserMock: vi.fn(),
  resetAnalyticsUserMock: vi.fn(),
  resetUserStoresMock: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: deleteItemAsyncMock,
  getItemAsync: getItemAsyncMock,
  setItemAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/lib/api", () => ({
  authApi: authApiMock,
}));

vi.mock("@/shared/lib/analytics", () => ({
  identifyUser: identifyUserMock,
  resetAnalyticsUser: resetAnalyticsUserMock,
}));

vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("./resetAll", () => ({
  resetUserStores: resetUserStoresMock,
}));

import { useAuthStore } from "./authStore";

const persistedUser = {
  id: "user-1",
  username: "offline-user",
  phone: "+79990000000",
  email: "offline@example.com",
  role: "USER" as const,
};

describe("authStore checkAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    getItemAsyncMock.mockResolvedValue("access-token");
    useAuthStore.setState({
      user: persistedUser,
      isLoading: false,
      isAuthenticated: false,
      pendingVkPhone: false,
      pendingVkConsent: false,
      vkConsentToken: null,
    });
  });

  it("keeps a persisted user authenticated when profile check times out offline", async () => {
    authApiMock.getProfile.mockResolvedValueOnce({
      success: false,
      error: "Сервер долго не отвечает. Попробуйте снова.",
      code: "REQUEST_TIMEOUT",
    });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({
      user: persistedUser,
      isAuthenticated: true,
      isLoading: false,
      pendingVkPhone: false,
    });
    expect(identifyUserMock).toHaveBeenCalledWith("user-1");
    expect(deleteItemAsyncMock).not.toHaveBeenCalled();
  });
});

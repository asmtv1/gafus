import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authApiMock,
  deleteItemAsyncMock,
  getItemAsyncMock,
  identifyUserMock,
  resetAnalyticsUserMock,
  resetUserStoresMock,
  setItemAsyncMock,
} = vi.hoisted(() => ({
  authApiMock: {
    getProfile: vi.fn(),
    getVkConsentContext: vi.fn(),
    loginViaVk: vi.fn(),
    register: vi.fn(),
    submitVkConsent: vi.fn(),
  },
  deleteItemAsyncMock: vi.fn(),
  getItemAsyncMock: vi.fn(),
  identifyUserMock: vi.fn(),
  resetAnalyticsUserMock: vi.fn(),
  resetUserStoresMock: vi.fn(),
  setItemAsyncMock: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: deleteItemAsyncMock,
  getItemAsync: getItemAsyncMock,
  setItemAsync: setItemAsyncMock,
}));

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "6f1c97b2-11c5-47ec-a634-1f5879500b4a"),
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
import type { UpdatedUserProfile } from "@/shared/lib/api/user";

const persistedUser = {
  id: "user-1",
  username: "offline-user",
  phone: "+79990000000",
  email: "offline@example.com",
  role: "USER" as const,
};

describe("authStore profile update", () => {
  const profile: UpdatedUserProfile = {
    userId: persistedUser.id,
    fullName: "Новое имя",
    about: "О себе",
    telegram: null,
    instagram: null,
    website: null,
    birthDate: null,
    avatarUrl: "/avatar.webp",
  };

  it("updates profile fields while preserving account identity and flags", () => {
    const user = { ...persistedUser, hasAppPassword: true, hasVkLinked: true };
    useAuthStore.setState({ user });

    useAuthStore.getState().setUserProfile(profile);

    expect(useAuthStore.getState().user).toEqual({ ...user, profile });
  });

  it("ignores a profile response after logout or a switch to another account", () => {
    useAuthStore.setState({ user: null });
    useAuthStore.getState().setUserProfile(profile);
    expect(useAuthStore.getState().user).toBeNull();

    const otherUser = { ...persistedUser, id: "other-user" };
    useAuthStore.setState({ user: otherUser });
    useAuthStore.getState().setUserProfile(profile);
    expect(useAuthStore.getState().user).toEqual(otherUser);
  });
});

describe("authStore checkAuth", () => {
  beforeEach(async () => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    getItemAsyncMock.mockResolvedValue("access-token");
    await useAuthStore.persist.rehydrate();
    useAuthStore.setState({
      user: persistedUser,
      isLoading: false,
      isAuthenticated: false,
      pendingVkPhone: false,
      pendingVkConsent: false,
      vkConsentToken: null,
      vkConsentState: null,
      vkConsentTempSessionId: null,
      vkConsentPromoCode: null,
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

  it("publishes the cached session before profile validation finishes", async () => {
    let resolveProfile!: (value: { success: true; data: typeof persistedUser }) => void;
    authApiMock.getProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );

    const checkPromise = useAuthStore.getState().checkAuth();

    await vi.waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({
        user: persistedUser,
        isAuthenticated: true,
        isLoading: false,
      });
    });

    resolveProfile({ success: true, data: persistedUser });
    await checkPromise;
  });

  it("clears an optimistically restored session when the server rejects it", async () => {
    authApiMock.getProfile.mockResolvedValueOnce({
      success: false,
      error: "Сессия истекла",
      code: "SESSION_EXPIRED",
    });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      pendingVkPhone: false,
    });
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("auth_token");
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("refresh_token");
  });
});

describe("authStore registration promo code", () => {
  beforeEach(async () => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    await useAuthStore.persist.rehydrate();
    useAuthStore.setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      pendingVkPhone: false,
      pendingVkConsent: false,
      vkConsentToken: null,
      vkConsentState: null,
      vkConsentTempSessionId: null,
      vkConsentPromoCode: null,
    });
  });

  it("sends the promo code as part of email registration", async () => {
    authApiMock.register.mockResolvedValueOnce({
      success: true,
      data: { accessToken: "access", refreshToken: "refresh", user: persistedUser },
    });

    const consentPayload = {
      acceptPersonalData: true,
      acceptPrivacyPolicy: true,
      acceptDataDistribution: true,
    };
    const result = await useAuthStore
      .getState()
      .register("new_user", "new@example.com", "Password1", "5f817a0b-8707-4a8f-b3c8-07baf5e7071c", consentPayload, "  WELCOME  ");

    expect(result).toEqual({ success: true });
    expect(authApiMock.register).toHaveBeenCalledWith(
      "new_user",
      "new@example.com",
      "Password1",
      "5f817a0b-8707-4a8f-b3c8-07baf5e7071c",
      consentPayload,
      "IOS",
      "  WELCOME  ",
    );
  });

  it("sends the promo code together with VK consents", async () => {
    authApiMock.submitVkConsent.mockResolvedValueOnce({
      success: true,
      data: {
        user: { id: "user-1", username: "vk-user", role: "USER" },
        accessToken: "access",
        refreshToken: "refresh",
        needsPhone: false,
      },
    });
    authApiMock.getProfile.mockResolvedValueOnce({ success: true, data: persistedUser });
    useAuthStore.setState({
      vkConsentToken: "vk-consent-token",
      vkConsentState: "oauth-state",
      vkConsentTempSessionId: "6f1c97b2-11c5-47ec-a634-1f5879500b4a",
      vkConsentExpiresAt: Date.now() + 60_000,
      pendingVkConsent: true,
    });

    const consentPayload = {
      acceptPersonalData: true,
      acceptPrivacyPolicy: true,
      acceptDataDistribution: true,
    };
    const result = await useAuthStore.getState().submitVkConsentComplete(consentPayload, "WELCOME");

    expect(result).toEqual({ success: true });
    expect(authApiMock.submitVkConsent).toHaveBeenCalledWith(
      "vk-consent-token",
      "oauth-state",
      "6f1c97b2-11c5-47ec-a634-1f5879500b4a",
      consentPayload,
      "WELCOME",
    );
  });

  it("keeps a VK pending user unauthenticated and stores only the resumable context", async () => {
    authApiMock.loginViaVk.mockResolvedValueOnce({
      success: true,
      data: {
        needsConsent: true,
        contextToken: "opaque-context",
        savedPromoCode: "WELCOME",
        user: { id: "pending-user", username: "vk-user", role: "USER" },
      },
    });

    const result = await useAuthStore.getState().loginViaVk({
      code: "provider-code",
      code_verifier: "verifier",
      device_id: "device",
      state: "oauth-state",
      promoCode: "WELCOME",
    });

    expect(result).toEqual({ success: true, needsConsent: true });
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      pendingVkConsent: true,
      vkConsentToken: "opaque-context",
      vkConsentState: "oauth-state",
      vkConsentPromoCode: "WELCOME",
    });
    expect(setItemAsyncMock).toHaveBeenCalledWith(
      "vk_registration_context",
      expect.stringContaining('"contextToken":"opaque-context"'),
    );
    expect(setItemAsyncMock).not.toHaveBeenCalledWith("auth_token", expect.anything());
  });

  it("keeps VK context on a transient consent failure, but clears an expired context", async () => {
    useAuthStore.setState({
      pendingVkConsent: true,
      vkConsentToken: "opaque-context",
      vkConsentState: "oauth-state",
      vkConsentTempSessionId: "stable-session",
      vkConsentPromoCode: "WELCOME",
      vkConsentExpiresAt: Date.now() + 60_000,
    });
    const consentPayload = {
      acceptPersonalData: true,
      acceptPrivacyPolicy: true,
      acceptDataDistribution: true,
    };
    authApiMock.submitVkConsent.mockResolvedValueOnce({
      success: false,
      error: "Ошибка подключения к серверу",
      code: "NETWORK_ERROR",
    });

    const transient = await useAuthStore.getState().submitVkConsentComplete(consentPayload, "EDITED");
    expect(transient).toMatchObject({ success: false, code: "NETWORK_ERROR" });
    expect(useAuthStore.getState()).toMatchObject({ pendingVkConsent: true, vkConsentToken: "opaque-context" });

    authApiMock.submitVkConsent.mockResolvedValueOnce({
      success: false,
      error: "Сессия истекла",
      code: "CONTEXT_EXPIRED",
    });
    const expired = await useAuthStore.getState().submitVkConsentComplete(consentPayload, "EDITED");
    expect(expired).toMatchObject({ success: false, code: "CONTEXT_EXPIRED" });
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      pendingVkConsent: false,
      vkConsentToken: null,
      vkConsentPromoCode: null,
    });
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("vk_registration_context");
  });

  it("persists the latest edited VK promo code while its context is still valid", async () => {
    useAuthStore.setState({
      pendingVkConsent: true,
      vkConsentToken: "opaque-context",
      vkConsentState: "oauth-state",
      vkConsentTempSessionId: "stable-session",
      vkConsentPromoCode: "OLD",
      vkConsentExpiresAt: Date.now() + 60_000,
    });

    await useAuthStore.getState().updateVkConsentPromoCode("  EDITED  ");

    expect(useAuthStore.getState().vkConsentPromoCode).toBe("EDITED");
    expect(setItemAsyncMock).toHaveBeenCalledWith(
      "vk_registration_context",
      expect.stringContaining('"promoCode":"EDITED"'),
    );
  });
});

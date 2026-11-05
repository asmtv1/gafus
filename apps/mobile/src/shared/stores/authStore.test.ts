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
    login: vi.fn(),
    logout: vi.fn(),
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
      verifiedSessionEpoch: null,
      pendingVkPhone: false,
      pendingVkConsent: false,
      vkConsentToken: null,
      vkConsentState: null,
      vkConsentTempSessionId: null,
      vkConsentPromoCode: null,
    });
  });

  it("migrates a previously authenticated user missing the V2 binding after an app update", async () => {
    // Old builds persisted auth_token + user but did not create gafus-v2-auth-binding.
    getItemAsyncMock.mockImplementation(async (key: string) =>
      key === "auth_token" ? "old-still-valid-access-token" : null,
    );
    authApiMock.getProfile.mockResolvedValueOnce({ success: true, data: persistedUser });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({
      user: persistedUser, isAuthenticated: true, isLoading: false,
    });
    const bindingWrite = setItemAsyncMock.mock.calls.find(([key]) =>
      key === "gafus-v2-auth-binding");
    expect(bindingWrite).toBeDefined();
    expect(JSON.parse(bindingWrite![1])).toMatchObject({
      schemaVersion: 2, principalId: persistedUser.id,
    });
    expect(useAuthStore.getState().verifiedSessionEpoch).toBe(
      JSON.parse(bindingWrite![1]).authEpoch,
    );
    expect(deleteItemAsyncMock).not.toHaveBeenCalledWith("auth_token");
    expect(deleteItemAsyncMock).not.toHaveBeenCalledWith("refresh_token");
  });

  it("preserves the existing verified offline epoch on upgrade", async () => {
    const oldEpoch = "9bd127ef-891c-4a10-b286-0d3ba55b7ba0";
    getItemAsyncMock.mockImplementation(async (key: string) => {
      if (key === "auth_token") return "access-token";
      if (key === "gafus-v2-auth-binding") return JSON.stringify({
        schemaVersion: 2, principalId: persistedUser.id, authEpoch: oldEpoch,
      });
      return null;
    });
    authApiMock.getProfile.mockResolvedValueOnce({ success: true, data: persistedUser });
    await useAuthStore.getState().checkAuth();

    const { newOnlyV2NativeQueues } = await import("@/shared/lib/offline/newOnlyV2Native");
    expect(newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch).toBe(oldEpoch);
    expect(useAuthStore.getState().verifiedSessionEpoch).toBe(oldEpoch);
    expect(setItemAsyncMock).not.toHaveBeenCalledWith(
      "gafus-v2-auth-binding", expect.any(String),
    );
  });

  it("publishes the verified epoch reactively after an optimistic cached login", async () => {
    let completeProfile!: (value: { success: true; data: typeof persistedUser }) => void;
    authApiMock.getProfile.mockImplementationOnce(() => new Promise(resolve => {
      completeProfile = resolve;
    }));
    const check = useAuthStore.getState().checkAuth();
    await vi.waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
    expect(useAuthStore.getState().verifiedSessionEpoch).toBeNull();
    const changes: (string | null)[] = [];
    const unsubscribe = useAuthStore.subscribe(state => {
      changes.push(state.verifiedSessionEpoch);
    });
    completeProfile({ success: true, data: persistedUser });
    await check;
    unsubscribe();
    expect(useAuthStore.getState().verifiedSessionEpoch).not.toBeNull();
    expect(changes).toContain(useAuthStore.getState().verifiedSessionEpoch);
  });

  it("never promotes cached identity to a new verified binding on a transient profile failure", async () => {
    getItemAsyncMock.mockImplementation(async (key: string) =>
      key === "auth_token" ? "access-token" : null,
    );
    authApiMock.getProfile.mockResolvedValueOnce({
      success: false, error: "Сервер долго не отвечает. Попробуйте снова.", code: "REQUEST_TIMEOUT",
    });
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().verifiedSessionEpoch).toBeNull();
    expect(setItemAsyncMock).not.toHaveBeenCalledWith(
      "gafus-v2-auth-binding", expect.any(String),
    );
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


describe("offline native logout revocation", () => {
  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    useAuthStore.setState({ user: persistedUser, isAuthenticated: true, isLoading: false });
  });

  it("signs out locally but securely keeps a failed server revocation for retry", async () => {
    getItemAsyncMock.mockImplementation(async (key: string) => key === "refresh_token" ? "refresh-secret" : null);
    authApiMock.logout.mockResolvedValue({ success: false, error: "offline" });
    await useAuthStore.getState().logout();
    expect(authApiMock.logout).toHaveBeenCalledWith("refresh-secret");
    expect(setItemAsyncMock).toHaveBeenCalledWith("auth_pending_logout_0", "refresh-secret");
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("auth_token");
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("refresh_token");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("hides private UI and clears local credentials before a stalled server logout", async () => {
    getItemAsyncMock.mockImplementation(async (key: string) =>
      key === "refresh_token" ? "stalled-refresh" : null);
    let resolveLogout!: (result: { success: boolean }) => void;
    authApiMock.logout.mockImplementation(() => new Promise((resolve) => { resolveLogout = resolve; }));
    const running = useAuthStore.getState().logout();
    // This assertion happens before the queued SecureStore/network operations.
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
    await vi.waitFor(() => expect(authApiMock.logout).toHaveBeenCalledWith("stalled-refresh"));
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("auth_token");
    expect(deleteItemAsyncMock).toHaveBeenCalledWith("refresh_token");
    resolveLogout({ success: false });
    await running;
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(setItemAsyncMock).toHaveBeenCalledWith("auth_pending_logout_0", "stalled-refresh");
  });

  it("retries only the pending revocation on the next login attempt", async () => {
    getItemAsyncMock.mockImplementation(async (key: string) => key === "auth_pending_logout_0" ? "old-refresh" : null);
    authApiMock.logout.mockResolvedValue({ success: true });
    authApiMock.login.mockResolvedValue({ success: false, error: "No user" });
    await useAuthStore.getState().login("someone", "password");
    await vi.waitFor(() => expect(deleteItemAsyncMock).toHaveBeenCalledWith("auth_pending_logout_0"));
    expect(authApiMock.logout).toHaveBeenCalledWith("old-refresh");
  });
});

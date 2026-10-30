import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  getProfile: vi.fn(),
  logout: vi.fn(),
  getVkConsentContext: vi.fn(),
  secureGet: vi.fn(),
  secureSet: vi.fn(),
  secureDelete: vi.fn(),
  resetUserStores: vi.fn(),
  clearGallery: vi.fn(),
  identifyUser: vi.fn(),
  resetAnalyticsUser: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: mocks.secureGet,
  setItemAsync: mocks.secureSet,
  deleteItemAsync: mocks.secureDelete,
}));
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn(() => "ecc74565-f036-49af-bf76-84f23089bdf8") }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/shared/lib/api", () => ({
  authApi: {
    login: mocks.login,
    getProfile: mocks.getProfile,
    logout: mocks.logout,
    getVkConsentContext: mocks.getVkConsentContext,
  },
}));
vi.mock("@/shared/lib/analytics", () => ({
  identifyUser: mocks.identifyUser,
  resetAnalyticsUser: mocks.resetAnalyticsUser,
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.reportError }));
vi.mock("./resetAll", () => ({ resetUserStores: mocks.resetUserStores }));
vi.mock("./galleryCleanupBridge", () => ({ clearRegisteredGallerySession: mocks.clearGallery }));
vi.mock("@/shared/lib/api/mobile-intro", () => ({
  trackMobileIntroAuthOutcome: vi.fn(),
}));

import { useAuthStore } from "./authStore";

const oldUser = {
  id: "USER_A",
  username: "user-a",
  role: "USER" as const,
  phone: "+79990000000",
  email: "user-a@example.invalid",
};
const newUser = {
  id: "USER_B",
  username: "user-b",
  role: "USER" as const,
  phone: "+79990000001",
  email: "user-b@example.invalid",
};

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe("AG3-AUTH-010 login fences startup checkAuth after a principal switch", () => {
  beforeEach(async () => {
    vi.stubGlobal("__DEV__", false);
    vi.clearAllMocks();
    mocks.secureGet.mockResolvedValue("old-access-token");
    mocks.secureSet.mockResolvedValue(undefined);
    mocks.secureDelete.mockResolvedValue(undefined);
    await useAuthStore.persist.rehydrate();
    useAuthStore.setState({
      user: oldUser,
      isLoading: false,
      isAuthenticated: false,
      pendingVkPhone: false,
      pendingVkConsent: false,
    });
    mocks.login.mockResolvedValue({
      success: true,
      data: { accessToken: "new-access", refreshToken: "new-refresh" },
    });
  });

  it("does not let late successful USER-A profile validation overwrite a completed USER-B login", async () => {
    const old = deferred<{ success: boolean; data: typeof oldUser }>();
    mocks.getProfile
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ success: true, data: newUser });
    const previousCheck = useAuthStore.getState().checkAuth();
    await vi.waitFor(() => {
      expect(mocks.getProfile).toHaveBeenCalledOnce();
    });

    expect(await useAuthStore.getState().login("user-b", "fixture-password")).toEqual({
      success: true,
    });
    expect(useAuthStore.getState()).toMatchObject({ user: newUser, isAuthenticated: true });

    old.resolve({ success: true, data: oldUser });
    await previousCheck;
    expect(useAuthStore.getState()).toMatchObject({
      user: newUser,
      isAuthenticated: true,
      isLoading: false,
    });
    expect(mocks.identifyUser).toHaveBeenLastCalledWith("USER_B");
    expect(mocks.secureDelete).not.toHaveBeenCalledWith("auth_token");
    expect(mocks.secureDelete).not.toHaveBeenCalledWith("refresh_token");
  });

  it("does not let late failed old-session validation delete the newer login tokens", async () => {
    const old = deferred<{ success: boolean; code: string; error: string }>();
    mocks.getProfile
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ success: true, data: newUser });
    const previousCheck = useAuthStore.getState().checkAuth();
    await vi.waitFor(() => {
      expect(mocks.getProfile).toHaveBeenCalledOnce();
    });

    await expect(useAuthStore.getState().login("user-b", "fixture-password")).resolves.toEqual({
      success: true,
    });
    old.resolve({ success: false, code: "SESSION_EXPIRED", error: "Old session expired" });
    await previousCheck;

    expect(useAuthStore.getState()).toMatchObject({
      user: newUser,
      isAuthenticated: true,
    });
    expect(mocks.secureDelete).not.toHaveBeenCalledWith("auth_token");
    expect(mocks.secureDelete).not.toHaveBeenCalledWith("refresh_token");
    expect(mocks.secureSet).toHaveBeenCalledWith("auth_token", "new-access");
    expect(mocks.secureSet).toHaveBeenCalledWith("refresh_token", "new-refresh");
  });

  it("finishes a successful login even when startup has no cached profile and old check remains pending", async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    const pending = deferred<{ success: boolean; data: typeof oldUser }>();
    mocks.getProfile
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce({ success: true, data: newUser });
    const oldCheck = useAuthStore.getState().checkAuth();
    await vi.waitFor(() => {
      expect(mocks.getProfile).toHaveBeenCalledOnce();
    });

    await expect(useAuthStore.getState().login("user-b", "fixture-password")).resolves.toEqual({
      success: true,
    });
    expect(useAuthStore.getState()).toMatchObject({
      user: newUser,
      isAuthenticated: true,
      isLoading: false,
    });
    pending.resolve({ success: true, data: oldUser });
    await oldCheck;
    expect(useAuthStore.getState()).toMatchObject({
      user: newUser,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("retains ordinary startup cached-session restoration when no newer login exists", async () => {
    mocks.getProfile.mockResolvedValueOnce({ success: true, data: oldUser });
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState()).toMatchObject({
      user: oldUser,
      isAuthenticated: true,
      isLoading: false,
    });
    expect(mocks.identifyUser).toHaveBeenLastCalledWith("USER_A");
  });
});

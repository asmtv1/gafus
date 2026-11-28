import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  api: vi.fn(), userId: "account-1", authenticated: true,
  loading: false, verified: true, epoch: "epoch-1", handleExpired: vi.fn(),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {
  otaNativeFingerprint: "a".repeat(64), otaNativeReleaseId: "00000000-0000-4000-8000-000000000001",
} } } }));
vi.mock("expo-updates", () => ({ runtimeVersion: "1.7.5" }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/shared/lib/ota/installationIdentity", () => ({
  ensureOtaInstallationIdentity: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000002"),
}));
vi.mock("@/shared/lib/api/client", () => ({ apiClient: state.api }));
vi.mock("@/shared/stores/authStore", () => ({ getSettledAuthSessionGeneration: () => 1, useAuthStore: {
  getState: () => ({ isAuthenticated: state.authenticated, isLoading: state.loading,
    verifiedSessionEpoch: state.verified ? state.epoch : null, user: { id: state.userId },
    handleSessionExpired: state.handleExpired }),
} }));

import { captureOtaSession } from "./session";

describe("authenticated mandatory OTA policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.userId = "account-1";
    state.authenticated = true;
    state.loading = false;
    state.verified = true;state.epoch = "epoch-1";
    state.api.mockResolvedValue({ success: true, data: {
      required: false, version: null, selectedRevision: null,
    } });
  });
  it("permits a single safe replay after JWT refresh, never after account switch", async () => {
    const { fetchMandatoryOtaCohortDecision } = await import("./mandatoryPolicyQuery");
    const result = await fetchMandatoryOtaCohortDecision(captureOtaSession()!);
    expect(result.required).toBe(false);
    const [url, options] = state.api.mock.calls[0]!;
    expect(url).toBe("/api/v1/mobile-ota-tester/mandatory-policy");
    expect(options.skipAuthRefreshReplay).toBeUndefined();
    expect(options.requestGuard()).toBe(true);
    state.userId = "account-2";
    expect(options.requestGuard()).toBe(false);
    state.userId = "account-1";
    state.verified = false;
    expect(options.requestGuard()).toBe(false);
    state.verified = true;state.epoch = "epoch-2";
    expect(options.requestGuard()).toBe(false);
  });
  it("invalidates only the matching expired session", async () => {
    const { fetchMandatoryOtaCohortDecision } = await import("./mandatoryPolicyQuery");
    state.api.mockResolvedValue({success:false,code:"SESSION_EXPIRED"});
    await expect(fetchMandatoryOtaCohortDecision(captureOtaSession()!)).rejects.toThrow();
    expect(state.handleExpired).toHaveBeenCalledOnce();
    state.handleExpired.mockClear();
    state.api.mockImplementation(async () => { state.epoch="epoch-2";
      return {success:false,code:"SESSION_EXPIRED"}; });
    await expect(fetchMandatoryOtaCohortDecision(captureOtaSession()!)).rejects.toThrow();
    expect(state.handleExpired).not.toHaveBeenCalled();
  });
});

describe("public mandatory OTA policy", () => {
  it("uses no JWT or token refresh for the guest installation", async () => {
    vi.clearAllMocks();
    state.authenticated = false;
    state.loading = false;
    state.api.mockResolvedValue({success:true,data:{required:true,version:"1.7.5-ota.6",selectedRevision:6}});
    const { fetchMandatoryOtaCohortDecision } = await import("./mandatoryPolicyQuery");
    expect((await fetchMandatoryOtaCohortDecision(captureOtaSession()!)).required).toBe(true);
    expect(state.api).toHaveBeenCalledWith("/api/v1/public/mobile-ota/mandatory-policy",
      expect.objectContaining({skipAuth:true,skipAuthRefreshReplay:true}));
    expect(state.handleExpired).not.toHaveBeenCalled();
  });
});

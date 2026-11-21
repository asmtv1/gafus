import { beforeEach, describe, expect, it, vi } from "vitest";
const stub = vi.hoisted(() => ({
  active: true, existing: null as string | null,
  get: vi.fn(), set: vi.fn(), param: vi.fn(), random: vi.fn(), api: vi.fn(),
  authorized:false, principal:"u1", busy:false, epoch:"epoch-1",
}));
vi.mock("expo-constants", () => ({default:{expoConfig:{extra:{otaNativeFingerprint:"b".repeat(64),get otaTransport(){return stub.active?"self-hosted":"eas";}}}}}));
vi.mock("expo-updates", () => ({isEnabled:true,runtimeVersion:"1.7.5",setExtraParamAsync: (...a:unknown[])=>stub.param(...a)}));
vi.mock("expo-secure-store", () => ({getItemAsync:(...a:unknown[])=>stub.get(...a),setItemAsync:(...a:unknown[])=>stub.set(...a)}));
vi.mock("expo-crypto", () => ({randomUUID:()=>stub.random()}));
vi.mock("react-native",()=>({Platform:{OS:"ios"}}));
vi.mock("@/shared/lib/api/client",()=>({apiClient:(...args:unknown[])=>stub.api(...args)}));
vi.mock("@/shared/stores/authStore",()=>({getSettledAuthSessionGeneration:()=>1,useAuthStore:{getState:()=>({
  isAuthenticated:stub.authorized,isLoading:stub.busy,verifiedSessionEpoch:stub.epoch,
  user:stub.authorized?{id:stub.principal}:null,
})}}));
describe("persistent installation cohort before native OTA request",()=>{
  it("creates one installation UUID, persists securely and supplies it to Expo native code",async()=>{
    stub.active=true;
    stub.get.mockResolvedValue(null);
    stub.set.mockResolvedValue(undefined);
    stub.param.mockResolvedValue(undefined);
    const id="7ba9c3db-d4b1-4cff-8d60-ce424d1706d5";
    stub.random.mockReturnValue(id);
    const {ensureOtaInstallationIdentity}=await import("./installationIdentity");
    const results=await Promise.all(Array.from({length:4},()=>ensureOtaInstallationIdentity()));
    expect(results).toEqual([id,id,id,id]);
    expect(stub.random).toHaveBeenCalledTimes(1);
    expect(stub.set).toHaveBeenCalledWith("gafus_ota_installation_id_v1",id);
    expect(stub.param).toHaveBeenCalledWith("gafus-installation-id",id);
  });
  it("never configures cohorts for existing EAS binaries",async()=>{
    vi.resetModules();
    stub.active=false;
    stub.get.mockClear();stub.param.mockClear();
    const {ensureOtaInstallationIdentity}=await import("./installationIdentity");
    expect(await ensureOtaInstallationIdentity()).toBeNull();
    expect(stub.get).not.toHaveBeenCalled();
    expect(stub.param).not.toHaveBeenCalled();
  });
  it("fails closed if native extra param cannot be initialized",async()=>{
    vi.resetModules();stub.active=true;
    stub.get.mockResolvedValue("7ba9c3db-d4b1-4cff-8d60-ce424d1706d5");
    stub.param.mockRejectedValueOnce(new Error("native disabled"));
    const {ensureOtaInstallationIdentity}=await import("./installationIdentity");
    await expect(ensureOtaInstallationIdentity()).rejects.toThrow("native disabled");
  });
});

describe("signed account tester grant on physical OTA checks",()=>{
  const installationId="7ba9c3db-d4b1-4cff-8d60-ce424d1706d5";
  const token=`v1.ABCD.${"A".repeat(43)}`;
  beforeEach(()=>{
    vi.resetModules();vi.clearAllMocks();
    stub.active=true;stub.authorized=false;stub.busy=false;stub.principal="u1";stub.epoch="epoch-1";
    stub.get.mockResolvedValue(installationId);
    stub.param.mockResolvedValue(undefined);
    stub.api.mockResolvedValue({success:true,data:{token}});
  });
  it("drops any old tester grant before checking a signed-out user's OTA",async()=>{
    const {refreshOtaTesterGrant}=await import("./installationIdentity");
    await refreshOtaTesterGrant();
    expect(stub.param).toHaveBeenCalledWith("gafus-tester-grant",null);
    expect(stub.api).not.toHaveBeenCalled();
  });
  it("requests server grant only for a verified authenticated principal",async()=>{
    stub.authorized=true;
    const {refreshOtaTesterGrant}=await import("./installationIdentity");
    await refreshOtaTesterGrant();
    expect(stub.api).toHaveBeenCalledWith("/api/v1/mobile-ota-tester/grant",expect.objectContaining({
      method:"POST",body:{installationId,platform:"ios",runtimeVersion:"1.7.5",nativeFingerprint:"b".repeat(64)},requestGuard:expect.any(Function),
    }));
    expect(stub.api.mock.calls[0]?.[1]?.skipAuthRefreshReplay).toBeUndefined();
    const requestGuard=stub.api.mock.calls[0]?.[1]?.requestGuard;
    expect(requestGuard()).toBe(true);
    stub.principal="other";
    expect(requestGuard()).toBe(false);
    stub.principal="u1";stub.epoch="epoch-2";
    expect(requestGuard()).toBe(false);
    expect(stub.param).toHaveBeenLastCalledWith("gafus-tester-grant",token);
  });
  it("fails closed for a non-tester or a failed network request",async()=>{
    stub.authorized=true;
    stub.api.mockResolvedValue({success:false,code:"OTA_NOT_TESTER"});
    const {refreshOtaTesterGrant}=await import("./installationIdentity");
    await refreshOtaTesterGrant();
    expect(stub.param).toHaveBeenLastCalledWith("gafus-tester-grant",null);
    stub.api.mockRejectedValue(new Error("network"));
    await refreshOtaTesterGrant();
    expect(stub.param).toHaveBeenLastCalledWith("gafus-tester-grant",null);
  });
});

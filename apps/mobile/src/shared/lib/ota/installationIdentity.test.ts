import { describe, expect, it, vi } from "vitest";
const stub = vi.hoisted(() => ({
  active: true, existing: null as string | null,
  get: vi.fn(), set: vi.fn(), param: vi.fn(), random: vi.fn(),
}));
vi.mock("expo-constants", () => ({default:{expoConfig:{extra:{get otaTransport(){return stub.active?"self-hosted":"eas";}}}}}));
vi.mock("expo-updates", () => ({isEnabled:true,setExtraParamAsync: (...a:unknown[])=>stub.param(...a)}));
vi.mock("expo-secure-store", () => ({getItemAsync:(...a:unknown[])=>stub.get(...a),setItemAsync:(...a:unknown[])=>stub.set(...a)}));
vi.mock("expo-crypto", () => ({randomUUID:()=>stub.random()}));
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

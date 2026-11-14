import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({
  records:new Map<string,string>(), active:true, platform:"ios",
  fetch:vi.fn(), id:0,
}));
vi.mock("@react-native-async-storage/async-storage",()=>({default:{
  getItem:async(key:string)=>m.records.get(key)??null,
  setItem:async(key:string,value:string)=>{m.records.set(key,value);},
}}));
vi.mock("expo-constants",()=>({default:{expoConfig:{
  updates:{url:"https://preview.gafus.test/ota/manifest"},
  extra:{
    get otaTransport(){return m.active?"self-hosted":"eas";},
    otaNativeFingerprint:"a".repeat(64),otaChannel:"preview",
  },
}}}));
vi.mock("expo-updates",()=>({isEnabled:true,isEmbeddedLaunch:false,runtimeVersion:"1.7.5",
  updateId:"9fd451f5-75bd-413a-92ee-4122fb93f9ba",
  createdAt:new Date("2026-11-12T10:00:00.000Z")}));
vi.mock("expo-crypto",()=>({randomUUID:()=>`00000000-0000-4000-8000-${String(++m.id).padStart(12,"0")}`}));
vi.mock("react-native",()=>({Platform:{get OS(){return m.platform;}}}));
vi.mock("./installationIdentity",()=>({
  ensureOtaInstallationIdentity:async()=>"7ba9c3db-d4b1-4cff-8d60-ce424d1706d5",
  selfHostedOtaActive:()=>m.active,
}));
beforeEach(()=>{
  vi.resetModules();m.records.clear();m.active=true;m.platform="ios";m.id=0;
  m.fetch.mockReset().mockResolvedValue({status:202});
  vi.stubGlobal("fetch",m.fetch);
});
describe("anonymous on-device OTA telemetry",()=>{
  it("submits only event fields without account or error text and clears accepted queue",async()=>{
    const {trackOtaEvent}=await import("./telemetry");
    await trackOtaEvent("DOWNLOADED","9fd451f5-75bd-413a-92ee-4122fb93f9ba");
    expect(m.fetch).toHaveBeenCalledTimes(1);
    const [url,options]=m.fetch.mock.calls[0];
    expect(url).toBe("https://preview.gafus.test/ota/telemetry");
    const body=JSON.parse(options.body);
    expect(body).toMatchObject({event:"DOWNLOADED",platform:"ios",runtimeVersion:"1.7.5",
      nativeFingerprint:"a".repeat(64),channel:"preview"});
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("errorText");
    expect(m.records.get("@gafus/ota/telemetry-queue-v1")).toBe("[]");
  });
  it("persists downloaded update before reload without blocking on telemetry network",async()=>{
    const {trackOtaEvent}=await import("./telemetry");
    await trackOtaEvent("DOWNLOADED","9fd451f5-75bd-413a-92ee-4122fb93f9ba",undefined,true);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(JSON.parse(m.records.get("@gafus/ota/telemetry-queue-v1")||"[]")).toHaveLength(1);
    await trackOtaEvent("LAUNCHED");
    expect(m.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(m.records.get("@gafus/ota/telemetry-queue-v1")||"[]")).toHaveLength(0);
  });
  it("retains offline events and flushes them on the next successful request",async()=>{
    m.fetch.mockRejectedValueOnce(new Error("offline"));
    const {trackOtaEvent}=await import("./telemetry");
    await trackOtaEvent("CHECKED");
    expect(JSON.parse(m.records.get("@gafus/ota/telemetry-queue-v1")||"[]")).toHaveLength(1);
    await trackOtaEvent("UPDATE_ERROR",undefined,"FETCH_FAILED");
    expect(m.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(m.records.get("@gafus/ota/telemetry-queue-v1")||"[]")).toHaveLength(0);
  });
  it("never submits existing EAS events",async()=>{
    m.active=false;
    const {trackOtaEvent}=await import("./telemetry");
    await trackOtaEvent("CHECKED");
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.records.size).toBe(0);
  });
  it("recognizes a backward-launch timestamp without deadlocking the queue",async()=>{
    m.records.set("@gafus/ota/last-launch-v1",JSON.stringify({
      runtime:"1.7.5",commit:Date.parse("2026-11-20T00:00:00.000Z")}));
    const {trackOtaLaunch}=await import("./telemetry");
    await trackOtaLaunch();
    expect(m.fetch).toHaveBeenCalledTimes(2);
    expect(m.fetch.mock.calls.map(x=>JSON.parse(x[1].body).event)).toEqual(["ROLLBACK_DETECTED","LAUNCHED"]);
  });
});

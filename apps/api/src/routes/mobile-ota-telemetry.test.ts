import { Hono } from "hono";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({ingest:vi.fn()}));
vi.mock("@gafus/mobile-ota-server/telemetry",async(importOriginal)=>({
  ...await importOriginal<typeof import("@gafus/mobile-ota-server/telemetry")>(),
  ingestOtaTelemetry:mocks.ingest,
}));
import { mobileOtaTelemetryRoutes } from "./mobile-ota-telemetry";
const previousEnv=process.env.MOBILE_OTA_DELIVERY_ENV;
const previousKey=process.env.MOBILE_OTA_INSTALLATION_HASH_KEY;
const body={
  eventId:"dd4fa60c-f471-4415-b1d1-53cf15b9da2e",
  installationId:"7ba9c3db-d4b1-4cff-8d60-ce424d1706d5",
  platform:"ios",channel:"preview",runtimeVersion:"1.7.5",
  nativeFingerprint:"a".repeat(64),event:"CHECKED",
};
function request(value:object=body) {
  const app=new Hono();app.route("/ota",mobileOtaTelemetryRoutes);
  return app.request("http://localhost/ota/telemetry",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value),
  });
}
beforeEach(()=>{
  vi.clearAllMocks();mocks.ingest.mockResolvedValue({accepted:true,replayed:false});
  process.env.MOBILE_OTA_DELIVERY_ENV="preview";
  process.env.MOBILE_OTA_INSTALLATION_HASH_KEY="example-ota-telemetry-secret-key-32chars-minimum";
});
afterEach(()=>{
  if(previousEnv===undefined)delete process.env.MOBILE_OTA_DELIVERY_ENV;
  else process.env.MOBILE_OTA_DELIVERY_ENV=previousEnv;
  if(previousKey===undefined)delete process.env.MOBILE_OTA_INSTALLATION_HASH_KEY;
  else process.env.MOBILE_OTA_INSTALLATION_HASH_KEY=previousKey;
});
describe("anonymous OTA lifecycle HTTP",()=>{
  it("disabled by default without independent install hash secret",async()=>{
    delete process.env.MOBILE_OTA_INSTALLATION_HASH_KEY;
    const res=await request();expect(res.status).toBe(404);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("caps bodies even without Content-Length and rejects oversized streamed telemetry",async()=>{
    const res=await request({...body,extra:"x".repeat(5000)});
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({code:"OTA_TELEMETRY_TOO_LARGE"});
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("accepts strict client-report, without auth cookies",async()=>{
    const res=await request();
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocks.ingest).toHaveBeenCalledWith(body,"preview",expect.any(String));
  });
  it.each([
    [{...body,other:"malicious"}],
    [{...body,installationId:"../../device"}],
    [{...body,nativeFingerprint:"not-a-hash"}],
    [{...body,event:"UPDATE_ERROR"}],
    [{...body,event:"CHECKED",failureCode:"FETCH_FAILED"}],
    [{...body,event:"UPDATE_ERROR",failureCode:"private data and cookies"}],
  ])("rejects invalid event and arbitrary error text %j",async(value)=>{
    const res=await request(value);expect(res.status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
});

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ register: vi.fn() }));
vi.mock("@gafus/mobile-ota-server/ci-registration", async (original) => ({
  ...await original<typeof import("@gafus/mobile-ota-server/ci-registration")>(),
  registerVerifiedOtaCiResult: mocks.register,
}));
import { internalMobileOtaCiRoutes } from "./internal-mobile-ota-ci";
const token="test-ota-ci-callback-token-012345678901234567890";
const previous={TOKEN:process.env.MOBILE_OTA_CI_CALLBACK_TOKEN, CDN:process.env.MOBILE_OTA_CDN_ORIGIN, ASSET:process.env.MOBILE_OTA_ASSET_ORIGIN};
function fetchRoute(body?: object, auth?: string) {
  const app=new Hono();app.route("/api/v1/internal/mobile-ota",internalMobileOtaCiRoutes);
  return app.request("http://localhost/api/v1/internal/mobile-ota/ci-complete",{
    method:"POST",headers:{"content-type":"application/json",...(auth ? {authorization:auth} : {})},
    body:JSON.stringify(body??{}),
  });
}
beforeEach(()=>{
  vi.clearAllMocks();
  process.env.MOBILE_OTA_CI_CALLBACK_TOKEN=token;
  delete process.env.MOBILE_OTA_ASSET_ORIGIN;
  process.env.MOBILE_OTA_CDN_ORIGIN="https://cdn.test";
  mocks.register.mockResolvedValue({releaseId:"ab5fd6d1-9099-4e19-97f4-f5bff26c5d09",replayed:false});
});
afterEach(()=>{
  if(previous.TOKEN===undefined) delete process.env.MOBILE_OTA_CI_CALLBACK_TOKEN;
  else process.env.MOBILE_OTA_CI_CALLBACK_TOKEN=previous.TOKEN;
  if(previous.CDN===undefined) delete process.env.MOBILE_OTA_CDN_ORIGIN;
  else process.env.MOBILE_OTA_CDN_ORIGIN=previous.CDN;
  if(previous.ASSET===undefined) delete process.env.MOBILE_OTA_ASSET_ORIGIN;
  else process.env.MOBILE_OTA_ASSET_ORIGIN=previous.ASSET;
});
describe("protected OTA CI completion callback",()=>{
  it("accepts the new direct S3 asset origin instead of the legacy CDN env",async()=>{
    delete process.env.MOBILE_OTA_CDN_ORIGIN;
    process.env.MOBILE_OTA_ASSET_ORIGIN="https://global.s3.cloud.ru/gafus-ota-updates";
    const r=await fetchRoute({},`Bearer ${token}`);
    expect(r.status).toBe(400);
  });
  it("is disabled without explicit configured credentials",async()=>{
    delete process.env.MOBILE_OTA_CI_CALLBACK_TOKEN;
    const r=await fetchRoute({},`Bearer ${token}`);
    expect(r.status).toBe(404);expect(mocks.register).not.toHaveBeenCalled();
  });
  it("rejects missing or mismatched CI bearer before parsing",async()=>{
    expect((await fetchRoute({secret:"malicious"})).status).toBe(401);
    expect((await fetchRoute({secret:"malicious"},"Bearer wrong-token")).status).toBe(401);
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("never accepts arbitrary command strings as CI payload",async()=>{
    const r=await fetchRoute({cmd:"cat private-key.pem"},`Bearer ${token}`);
    expect(r.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("all private responses are uncacheable",async()=>{
    const r=await fetchRoute();
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});

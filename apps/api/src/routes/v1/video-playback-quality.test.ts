import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  verify:vi.fn(), registration:vi.fn(),record:vi.fn(),
}));
vi.mock("@gafus/auth/jwt",()=>({verifyAccessToken:mocks.verify}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:mocks.registration}));
vi.mock("@gafus/core/services/videoPlaybackQuality",()=>({
  recordVideoPlaybackQuality:mocks.record,
}));
import { authMiddleware } from "../../middleware/auth";
import { videoPlaybackQualityRoutes } from "./video-playback-quality";

const base="/api/v1/video-quality";
const payload={
  id:"8664167d-0459-47ec-aa50-f4c3e5b3f302",
  surface:"chat",platform:"android",quality:360,mode:"auto",
  available360:true,available720:true,networkClass:"cellular",
  saveData:true,fallback:false,
};
function request(event:unknown,token=true) {
  const app=new Hono();
  app.use(base+"/*",authMiddleware);
  app.route(base,videoPlaybackQualityRoutes);
  return app.request("http://local.test"+base+"/start",{
    method:"POST",
    headers:{
      "content-type":"application/json",
      ...(token?{authorization:"Bearer test"}:{}),
    },
    body:JSON.stringify(event),
  });
}
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({id:"user1",role:"USER",username:"regular"});
  mocks.registration.mockResolvedValue(true);
  mocks.record.mockResolvedValue(undefined);
});
describe("quality playback telemetry ingestion",()=>{
  it("requires real authorization before storing an event",async()=>{
    expect((await request(payload,false)).status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("accepts a strict anonymous 360p start without storing user or media IDs",async()=>{
    const result=await request(payload);
    expect(result.status).toBe(202);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(payload);
    expect(await result.json()).toEqual({success:true});
  });
  it("rejects wrong variants, unsupported platforms, spoofed extra PII and malformed UUIDs",async()=>{
    for (const data of [
      {...payload,quality:1080},
      {...payload,available360:false},
      {...payload,surface:"album"},
      {...payload,platform:"desktop"},
      {...payload,id:"not-a-uuid"},
      {...payload,userId:"should-not-be-stored"},
    ]) expect((await request(data)).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("does not leak database errors or make them look like accepted events",async()=>{
    mocks.record.mockRejectedValue(Error("postgres-private"));
    const res=await request(payload);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("postgres-private");
  });
});

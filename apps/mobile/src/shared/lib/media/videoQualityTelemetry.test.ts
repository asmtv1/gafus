import { beforeEach, describe, expect, it, vi } from "vitest";
const fake=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("@/shared/lib/api/client",()=>({apiClient:fake.request}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"8664167d-0459-47ec-aa50-f4c3e5b3f302"}));
vi.mock("react-native",()=>({Platform:{OS:"android"}}));
import { reportNativeVideoStarted } from "./videoQualityTelemetry";

const sources={360:"https://cdn.test/360.mp4",720:"https://cdn.test/720.mp4"};
beforeEach(()=>{vi.clearAllMocks(); fake.request.mockResolvedValue({success:true});});
describe("Mobile playback statistics",()=>{
  it("reports actually playing 360p with coarse network class, not media/user identifiers",()=>{
    reportNativeVideoStarted({surface:"chat",quality:360,mode:"auto",available:sources,
      hints:{width:220,connectionType:"cellular",metered:true},fallback:true});
    expect(fake.request).toHaveBeenCalledExactlyOnceWith("/api/v1/video-quality/start",
      expect.objectContaining({method:"POST",skipAuthRefreshReplay:true,body:{
        id:"8664167d-0459-47ec-aa50-f4c3e5b3f302",
        surface:"chat",platform:"android",quality:360,mode:"auto",
        available360:true,available720:true,networkClass:"cellular",
        saveData:true,fallback:true,
      }}));
    expect(Object.keys(fake.request.mock.calls[0]?.[1]?.body).sort()).toEqual([
      "available360","available720","fallback","id","mode","networkClass",
      "platform","quality","saveData","surface",
    ]);
  });
  it("skips a missing selected MP4 rather than fabricating a source",()=>{
    reportNativeVideoStarted({surface:"moments",quality:360,mode:"auto",
      available:{720:sources[720]},hints:{width:360},fallback:false});
    expect(fake.request).not.toHaveBeenCalled();
  });
});

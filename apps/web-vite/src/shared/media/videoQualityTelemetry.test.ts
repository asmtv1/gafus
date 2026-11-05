// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("../api/client",()=>({apiRequest:fake.request}));
import { reportWebVideoStarted } from "./videoQualityTelemetry";

const mp4={360:"https://media.example.test/video/360.mp4",720:"https://media.example.test/video/720.mp4"};
beforeEach(()=>{
  vi.clearAllMocks();
  fake.request.mockResolvedValue(undefined);
  Object.defineProperty(window.crypto,"randomUUID",{configurable:true,
    value:()=>"8664167d-0459-47ec-aa50-f4c3e5b3f302"});
});
describe("Web playback statistics",()=>{
  it("sends anonymized actual 720p with available variants and manual mode",()=>{
    reportWebVideoStarted({surface:"moments",quality:720,mode:720,available:mp4,
      hints:{width:500,connectionType:"wifi"},fallback:false});
    expect(fake.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/video-quality/start",
      expect.objectContaining({method:"POST",browserAuth:true,json:{
        id:"8664167d-0459-47ec-aa50-f4c3e5b3f302",
        surface:"moments",platform:"web",quality:720,mode:"manual",
        available360:true,available720:true,networkClass:"wifi",
        saveData:false,fallback:false,
      }}));
    const payload=fake.request.mock.calls[0]?.[1]?.json;
    expect(Object.keys(payload).sort()).toEqual([
      "available360","available720","fallback","id","mode","networkClass",
      "platform","quality","saveData","surface",
    ]);
  });
  it("does not report a missing/unsigned source and ignores a rejected request",()=>{
    reportWebVideoStarted({surface:"moments",quality:360,mode:"auto",available:{720:mp4[720]},
      hints:{width:220},fallback:false});
    expect(fake.request).not.toHaveBeenCalled();
    fake.request.mockRejectedValue(Error("network"));
    expect(()=>reportWebVideoStarted({surface:"chat",quality:360,mode:"auto",
      available:mp4,hints:{width:220},fallback:true})).not.toThrow();
    expect(fake.request).toHaveBeenCalledTimes(1);
  });
});

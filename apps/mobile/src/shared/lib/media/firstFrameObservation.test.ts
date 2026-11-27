import {describe,it,expect,vi} from "vitest";
import {createNativeFrameObservation} from "./firstFrameObservation";
describe("native view first frame",()=>{
  it("records only the real first frame and ignores fullscreen/track duplicate callback",()=>{
    let now=100;const report=vi.fn();const a=createNativeFrameObservation(()=>now,report);
    expect(report).not.toHaveBeenCalled();
    now=450;a.firstFrame();now=800;a.firstFrame();a.dispose();
    expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"rendered",elapsedMs:350});
  });
  it("marks unmount before callback as abandoned, not a zero-duration rendered frame",()=>{
    const report=vi.fn();const a=createNativeFrameObservation(()=>100,report);
    a.dispose();a.firstFrame();expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"abandoned"});
  });
  it("bounds very long/negative intervals and isolates telemetry failures",()=>{
    const report=vi.fn(()=>{throw Error("report failure")});let now=1;
    const a=createNativeFrameObservation(()=>now,report);now=150001;
    expect(()=>a.firstFrame()).not.toThrow();expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"abandoned"});
    const b=createNativeFrameObservation(()=>now,report);now=0;b.firstFrame();
    expect(report).toHaveBeenCalledTimes(2);
  });
});

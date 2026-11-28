import {describe,it,expect,vi} from "vitest";
import {observeFirstVideoFrame} from "./observeFirstVideoFrame";
function fake(supported=true) {
  const events=new EventTarget();
  type FrameCallback = (time?: number, metadata?: { presentationTime: number }) => void;
  const frames=new Map<number,FrameCallback>();
  let next=0;
  const video=Object.assign(events,{
    ...(supported?{requestVideoFrameCallback:(cb:FrameCallback)=>{
      frames.set(++next,cb);return next;
    },
      cancelVideoFrameCallback:(id:number)=>{frames.delete(id);}}:{}),
  }) as unknown as HTMLVideoElement;
  return {video,frames,dispatch:(event:string)=>video.dispatchEvent(new Event(event))};
}
describe("actual browser compositor callbacks",()=>{
  it("loadeddata, ready and playing alone never report first frame",()=>{
    let now=100;const report=vi.fn();const f=fake();
    const stop=observeFirstVideoFrame(f.video,report,()=>now);
    f.dispatch("loadstart");f.dispatch("loadeddata");f.dispatch("canplay");f.dispatch("playing");
    expect(report).not.toHaveBeenCalled();now=550;f.frames.get(1)!();
    expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"rendered",elapsedMs:450});stop();
    expect(report).toHaveBeenCalledTimes(1);
  });
  it("uses compositor submission timestamp rather than a delayed JS callback",()=>{
    let now=100;const report=vi.fn();const f=fake();
    const stop=observeFirstVideoFrame(f.video,report,()=>now);
    f.dispatch("loadstart");now=1800;f.frames.get(1)!(1800,{presentationTime:500});stop();
    expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"rendered",elapsedMs:400});
  });
  it("fences a callback from the old load and measures the replacement only",()=>{
    let now=100;const report=vi.fn();const f=fake();
    const stop=observeFirstVideoFrame(f.video,report,()=>now);
    f.dispatch("loadstart");const old=f.frames.get(1)!;
    now=200;f.dispatch("emptied");f.dispatch("loadstart");old();
    expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"abandoned"});
    now=900;f.frames.get(2)!();stop();expect(report.mock.calls).toEqual([[{outcome:"abandoned"}],[{outcome:"rendered",elapsedMs:700}]]);
  });
  it("unsupported browser is reported without a synthetic loadeddata duration",()=>{
    const report=vi.fn();const f=fake(false);
    const stop=observeFirstVideoFrame(f.video,report,()=>100);
    f.dispatch("loadstart");f.dispatch("playing");stop();
    expect(report).toHaveBeenCalledExactlyOnceWith({outcome:"unsupported"});
  });
  it("error and unmount cancel pending observations, and late callbacks do nothing",()=>{
    const report=vi.fn();const f=fake();const stop=observeFirstVideoFrame(f.video,report,()=>100);
    f.dispatch("loadstart");const old=f.frames.get(1)!;f.dispatch("error");old();
    f.dispatch("loadstart");const late=f.frames.get(2)!;stop();late();
    expect(report.mock.calls).toEqual([[{outcome:"abandoned"}],[{outcome:"abandoned"}]]);
  });
});

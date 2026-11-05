// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserVideo720Available, prepareBrowserVideo720 } from "./browserVideo720";
import { canReuseWeb720, webVideo720Dimensions } from "./browserVideo720Policy";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const input = () => new File([new Uint8Array(6000)], "walk.mov", { type: "video/quicktime" });

describe("browser-side 720p encoding policy", () => {
  it("preserves portrait/landscape, never upscales or crops, rejects broken dimensions", () => {
    expect(webVideo720Dimensions(1920,1080)).toEqual({ width: 1280, height: 720 });
    expect(webVideo720Dimensions(1080,1920)).toEqual({ width: 720, height: 1280 });
    expect(webVideo720Dimensions(720,1280)).toEqual({ width: 720, height: 1280 });
    expect(webVideo720Dimensions(640,360)).toBeNull();
    expect(webVideo720Dimensions(500,5000)).toBeNull();
    expect(webVideo720Dimensions(Number.NaN,1080)).toBeNull();
  });
  it("retains original when WebCodecs or Worker is unavailable", async () => {
    const file = input();
    expect(browserVideo720Available()).toBe(false);
    expect(await prepareBrowserVideo720(file)).toBe(file);
  });
  function browserWorker(process: (file: File, respond: (kind: string, value?: unknown) => void) => void) {
    vi.stubGlobal("VideoDecoder", class {});
    vi.stubGlobal("VideoEncoder", class {});
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn(({file}: {file: File}) => {
        queueMicrotask(() => process(file, (kind, value) => {
          this.onmessage?.({data: kind === "result" ? {kind, file: value} :
            kind === "progress" ? {kind, value} : {kind}} as MessageEvent);
        }));
      });
    }
    vi.stubGlobal("Worker", FakeWorker);
  }
  it("returns the prepared MP4, reports progress and caches it for retries", async () => {
    const file = input();
    const compressed = new File([new Uint8Array(2000)], "walk-720.mp4", {type: "video/mp4"});
    const progress: number[] = [];
    const work = vi.fn();
    browserWorker((_file, respond) => {
      work(); respond("progress", .5); respond("result", compressed);
    });
    expect(browserVideo720Available()).toBe(true);
    expect(await prepareBrowserVideo720(file, p => progress.push(p))).toBe(compressed);
    expect(progress).toEqual([50]);
    expect(await prepareBrowserVideo720(file)).toBe(compressed);
    expect(work).toHaveBeenCalledOnce();
  });
  it("accepts standardized output even if larger than a noncompliant original", async () => {
    const a = input();
    browserWorker((_file, respond) => respond("result",
      new File([new Uint8Array(8000)], "too-large.mp4", {type: "video/mp4"})));
    const output=await prepareBrowserVideo720(a);
    expect(output).not.toBe(a);
    expect(output.size).toBe(8000);
    const b = input();
    browserWorker((_file, respond) => respond("fallback"));
    expect(await prepareBrowserVideo720(b)).toBe(b);
  });
  it("reuses only compact MP4 H264 AAC with no more than 30 FPS", () => {
    const good = {container:"mp4", videoCodec:"avc", audioCodec:"aac",
      videoTracks:1, audioTracks:1, otherTracks:0, width:1280, height:720,
      duration:60, maxFrameRate:30, totalBitrate:1_850_000, hdr:false, rotation:0};
    expect(canReuseWeb720(good)).toBe(true);
    expect(canReuseWeb720({...good, videoCodec:"hevc"})).toBe(false);
    expect(canReuseWeb720({...good, audioCodec:"opus"})).toBe(false);
    expect(canReuseWeb720({...good, maxFrameRate:60})).toBe(false);
    expect(canReuseWeb720({...good, maxFrameRate:31})).toBe(false);
    expect(canReuseWeb720({...good, totalBitrate:2_800_000})).toBe(false);
    expect(canReuseWeb720({...good, height:1080})).toBe(false);
    expect(canReuseWeb720({...good, hdr:true})).toBe(false);
    expect(canReuseWeb720({...good, rotation:90})).toBe(false);
    expect(canReuseWeb720({...good, container:"mov"})).toBe(false);
    expect(canReuseWeb720({...good, videoTracks:2})).toBe(false);
  });
  it("keeps original without another encode when metadata inspection approves it", async () => {
    const file = input();
    const work = vi.fn();
    browserWorker((_file, respond) => { work(); respond("reusable"); });
    expect(await prepareBrowserVideo720(file)).toBe(file);
    expect(work).toHaveBeenCalledOnce();
  });
  it("strict upload fails with clear browser guidance when WebCodecs is unavailable", async () => {
    const file = input();
    await expect(prepareBrowserVideo720(file, undefined, true))
      .rejects.toThrow("LOCAL_VIDEO_BROWSER_UNSUPPORTED");
  });
  it("strict upload never falls back to the original and reruns the worker on retry", async () => {
    const file = input();
    const encoded = new File([new Uint8Array(2400)],"ready.mp4",{type:"video/mp4"});
    let passes=0;
    browserWorker((_input, respond) => {
      passes++;
      if (passes === 1) respond("fallback");
      else respond("result",encoded);
    });
    await expect(prepareBrowserVideo720(file, undefined, true))
      .rejects.toThrow("LOCAL_VIDEO_CONVERSION_FAILED");
    const retry = await prepareBrowserVideo720(file, undefined, true);
    expect(retry).toBe(encoded);
    expect(passes).toBe(2);
    expect(await prepareBrowserVideo720(file, undefined, true)).toBe(encoded);
    expect(passes).toBe(2);
  });
  it("strict upload reuses an original only after worker verifies compliant MP4", async () => {
    const file = new File([new Uint8Array(6000)],"valid.mp4",{type:"video/mp4"});
    browserWorker((_input,respond)=>respond("reusable"));
    expect(await prepareBrowserVideo720(file, undefined, true)).toBe(file);
  });
  it("honors emergency disable flag", async () => {
    vi.stubEnv("VITE_CLIENT_VIDEO_720", "false");
    expect(browserVideo720Available()).toBe(false);
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeedCommandRunner } from "./index.js";
import { processFeedV2Video } from "./feed-v2.js";

// Temporary artifacts MUST remain inside the authorized Refactor workspace.
const localDirectory = fileURLToPath(new URL(".", import.meta.url));
const workingDir = await mkdtemp(join(localDirectory, ".feed-v2-generated-"));
afterAll(async () => { await rm(workingDir, { recursive: true, force: false }); });
describe("Feed V2 real ffmpeg smoke (no S3, no production)", () => {
  it("encodes short video + audio to faststart MP4 and WebP poster without creating HLS", async () => {
    const source = join(workingDir, "source.mp4");
    const runner = createFeedCommandRunner({ timeoutMs: 60_000 });
    await runner("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
      "-t", "1", "-threads", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest", source], 64 * 1024);
    const result = await processFeedV2Video(source, join(workingDir, "outputs"), runner);
    expect(result.info.hasAudio).toBe(true);
    expect(result.mp4).toHaveLength(1);
    expect(result.mp4[0]).toMatchObject({ quality: 360, width: 640, height: 360 });
    expect((await stat(result.poster)).size).toBeGreaterThan(0);
    expect((await readdir(join(workingDir, "outputs"))).sort()).toEqual(["360.mp4", "poster.webp"]);
  }, 90_000);
  it("publishes 720p+poster first and later adds 360p without regenerating poster", async () => {
    const source=join(workingDir,"split-phase-source.mp4");
    const runner=createFeedCommandRunner({timeoutMs:60_000});
    await runner("ffmpeg",["-hide_banner","-nostdin","-loglevel","error","-y",
      "-f","lavfi","-i","testsrc2=size=1280x720:rate=30",
      "-t","2","-threads","2","-c:v","libx264","-preset","ultrafast",
      "-pix_fmt","yuv420p",source],64*1024);
    const first=await processFeedV2Video(source,join(workingDir,"split-phase-720"),
      runner,[360,720],{firstPlayableOnly:true,preset:"medium",reuseClient720IfValid:true});
    expect(first.mp4.map(file=>file.quality)).toEqual([720]);
    expect((await stat(first.poster)).size).toBeGreaterThan(0);
    const later=await processFeedV2Video(first.mp4[0]!.path,
      join(workingDir,"split-phase-360"),runner,[360],{
        preset:"medium",skipPoster:true,rateControl:"capped-crf"});
    expect(later.mp4.map(file=>file.quality)).toEqual([360]);
    await expect(stat(later.poster)).rejects.toThrow();
    expect((await stat(first.mp4[0]!.path)).size).toBeGreaterThan(0);
    for(const rendition of [...first.mp4,...later.mp4]){
      const meta=JSON.parse(await runner("ffprobe",["-v","error","-select_streams","v:0",
        "-show_entries","stream=codec_name,profile,width,height,avg_frame_rate",
        "-of","json",rendition.path],16*1024)) as {streams:Array<{
          codec_name:string;profile:string;width:number;height:number;avg_frame_rate:string}>};
      expect(meta.streams[0]?.codec_name).toBe("h264");
      expect(meta.streams[0]?.height).toBe(rendition.quality);
      expect(meta.streams[0]?.avg_frame_rate).toBe("30/1");
      if(rendition.quality===360)expect(meta.streams[0]?.profile).toBe("Main");
    }
  },90_000);
  it("encodes both cloud profiles using x264 medium: Main 360p, High 720p", async () => {
    const source = join(workingDir, "cloud-medium-source.mp4");
    const runner = createFeedCommandRunner({ timeoutMs: 60_000 });
    await runner("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=450:sample_rate=44100",
      "-t", "2", "-threads", "2", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source], 64 * 1024);
    const calls: string[][] = [];
    const observed: typeof runner = async (command, args, maxBytes) => {
      if (command === "ffmpeg") calls.push(args);
      return runner(command, args, maxBytes);
    };
    const result = await processFeedV2Video(source, join(workingDir, "medium-profiles"),
      observed, [360, 720], { preset: "medium", decoderThreads: 1, encoderThreads: 2,
        reuseClient720IfValid: true, rateControl: "capped-crf", parallelRenditions: false });
    expect(result.mp4.map(item => item.quality)).toEqual([360, 720]);
    expect(calls.filter(args => args.includes("medium"))).toHaveLength(2);
    expect(calls.filter(args => args.includes("copy"))).toHaveLength(0);
    for (const mp4 of result.mp4) {
      const output = JSON.parse(await runner("ffprobe", ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,profile,pix_fmt,avg_frame_rate", "-of", "json", mp4.path],
        16 * 1024)) as { streams?: Array<{codec_name:string;profile:string;pix_fmt:string;avg_frame_rate:string}> };
      const stream = output.streams?.[0];
      expect(stream?.codec_name).toBe("h264");
      expect(stream?.pix_fmt).toBe("yuv420p");
      expect(stream?.profile).toBe(mp4.quality === 720 ? "High" : "Main");
      expect(stream?.avg_frame_rate).toBe("30/1");
    }
  }, 90_000);
  it("reuses compatible phone 720p without re-encoding while producing 360p and cover", async () => {
    const source = join(workingDir, "phone720.mp4");
    const runner = createFeedCommandRunner({ timeoutMs: 60_000 });
    await runner("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
      "-t", "1", "-threads", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-b:v", "500k", "-c:a", "aac", "-metadata", "comment=should_be_removed",
      "-shortest", source], 64 * 1024);
    const ffmpegCalls: string[][] = [];
    const observed: typeof runner = async (binary, args, bytes) => {
      if (binary === "ffmpeg") ffmpegCalls.push(args);
      return runner(binary, args, bytes);
    };
    const result = await processFeedV2Video(source, join(workingDir, "phone-output"),
      observed, [360, 720], { reuseClient720IfValid: true });
    expect(result.mp4.map(v => v.quality)).toEqual([360, 720]);
    expect(ffmpegCalls.filter(args => args.includes("-c") && args.includes("copy"))).toHaveLength(1);
    expect(ffmpegCalls.filter(args => args.includes("libx264"))).toHaveLength(1);
    const metadata = JSON.parse(await runner("ffprobe", ["-v", "error", "-show_format",
      "-of", "json", result.mp4[1]!.path], 8 * 1024)) as {format?: {tags?: {comment?: string}}};
    expect(metadata.format?.tags?.comment).toBeUndefined();
    expect((await stat(result.poster)).size).toBeGreaterThan(0);
  }, 90_000);

});

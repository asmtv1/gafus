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
});

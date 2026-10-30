import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  localLegacyTrainingVideoEnabled, localLegacyTrainerVideoUrl,
  readLocalLegacyTrainerPlaylist, readLocalLegacyTrainerVideo,
} from "./localLegacyTrainingVideo";

const valid = "trainers/trainer_1/videocourses/video_1/hls/master.m3u8";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
  vi.stubEnv("GAFUS_ISOLATED_NONPROD_S3", "enabled");
  vi.stubEnv("GAFUS_LOCAL_LEGACY_VIDEO_READ_ONLY", "1");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("local, public legacy trainer HLS read-only adapter", () => {
  it("denies production and missing opt-in", () => {
    expect(localLegacyTrainingVideoEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => localLegacyTrainerVideoUrl(valid)).toThrow("DENIED");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_LEGACY_VIDEO_READ_ONLY", "");
    expect(() => localLegacyTrainerVideoUrl(valid)).toThrow("DENIED");
  });
  it("allows only exact trainer HLS objects and never arbitrary network hosts", () => {
    expect(localLegacyTrainerVideoUrl(valid)).toBe(
      "https://storage.yandexcloud.net/gafus-media/uploads/" + valid,
    );
    expect(localLegacyTrainerVideoUrl("uploads/" + valid)).toBe(
      "https://storage.yandexcloud.net/gafus-media/uploads/" + valid,
    );
    for (const invalid of [
      "../../video.m3u8", "trainers/x/videocourses/y/hls/../../hi.ts",
      "trainers/x/videocourses/y/hls/evil.ts?x=1",
      "trainers/x/videocourses/y/hls/evil.ts/../../secret",
      "https://evil.test/hi.ts", "uploads/questions/foo.jpg",
      "trainers/x/videocourses/y/original.mp4",
    ]) expect(() => localLegacyTrainerVideoUrl(invalid)).toThrow("DENIED");
  });
  it("uses unauthenticated GET without redirect and rejects invalid ranges", async () => {
    const fetcher = vi.fn(async () => new Response("#EXTM3U\n#EXTINF:3,\nclip.ts\n"));
    vi.stubGlobal("fetch", fetcher);
    await expect(readLocalLegacyTrainerPlaylist(valid)).resolves.toEqual(
      Buffer.from("#EXTM3U\n#EXTINF:3,\nclip.ts\n"),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://storage.yandexcloud.net/gafus-media/uploads/" + valid,
      expect.objectContaining({ method: "GET", redirect: "error", cache: "no-store" }),
    );
    await expect(readLocalLegacyTrainerVideo(valid, "bytes=0-100,102-200"))
      .rejects.toThrow("RANGE_DENIED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized playlists and storage errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("a".repeat(512 * 1024 + 1))));
    await expect(readLocalLegacyTrainerPlaylist(valid)).rejects.toThrow("TOO_LARGE");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    await expect(readLocalLegacyTrainerPlaylist(valid)).rejects.toThrow("UNAVAILABLE");
  });
});

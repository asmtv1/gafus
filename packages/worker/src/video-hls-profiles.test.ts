import { describe, expect, it } from "vitest";

import { createHlsMasterPlaylist, createHlsRenditions } from "./video-hls-profiles";

describe("createHlsRenditions", () => {
  it("creates a full ABR ladder for a high bitrate 1080p source", () => {
    expect(createHlsRenditions(1080, 5_000_000).map((item) => item.name)).toEqual([
      "360p",
      "540p",
      "720p",
      "1080p",
    ]);
  });

  it("never upscales and preserves a non-standard source height", () => {
    expect(createHlsRenditions(480, 1_000_000)).toEqual([
      { name: "360p", height: 360, videoBitrate: 700_000 },
      { name: "480p", height: 480, videoBitrate: 1_000_000 },
    ]);
  });

  it("keeps a usable source profile for low bitrate video", () => {
    expect(createHlsRenditions(1080, 500_000)).toEqual([
      { name: "360p", height: 360, videoBitrate: 500_000 },
      { name: "1080p", height: 1080, videoBitrate: 500_000 },
    ]);
  });
});

describe("createHlsMasterPlaylist", () => {
  it("references every media playlist with bandwidth metadata", () => {
    const playlist = createHlsMasterPlaylist(
      [
        { name: "360p", height: 360, videoBitrate: 700_000 },
        { name: "720p", height: 720, videoBitrate: 2_500_000 },
      ],
      128_000,
    );

    expect(playlist).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
    expect(playlist).toContain("AVERAGE-BANDWIDTH=828000");
    expect(playlist).toContain("360p.m3u8");
    expect(playlist).toContain("720p.m3u8");
  });
});

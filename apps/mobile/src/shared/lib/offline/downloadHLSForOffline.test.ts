import { describe, expect, it } from "vitest";

import { selectHighestBandwidthVariant } from "./hlsOfflineManifest";

describe("selectHighestBandwidthVariant", () => {
  it("выбирает вариант с максимальным BANDWIDTH", () => {
    const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=960x540
540p.m3u8`;

    expect(selectHighestBandwidthVariant(manifest)).toBe("720p.m3u8");
  });

  it("возвращает null для media playlist", () => {
    expect(selectHighestBandwidthVariant("#EXTM3U\n#EXTINF:4,\nsegment-001.ts")).toBeNull();
  });
});

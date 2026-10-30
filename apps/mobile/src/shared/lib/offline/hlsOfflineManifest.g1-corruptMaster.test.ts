import { describe, expect, it } from "vitest";

import { selectHighestBandwidthVariant } from "./hlsOfflineManifest";

describe("AG3-OFF-020 malformed HLS master variants stay within their own URI line", () => {
  it("does not borrow a lower-bandwidth URI for a higher variant missing its URI", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160",
      "#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=1280x720",
      "720p.m3u8",
    ].join("\n");
    expect(selectHighestBandwidthVariant(manifest)).toBe("720p.m3u8");
  });

  it("returns null if a stream variant has no following URI before another tag", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=9000000",
      "#EXT-X-ENDLIST",
      "#EXTINF:10,",
      "segment0001.ts",
    ].join("\n");
    expect(selectHighestBandwidthVariant(manifest)).toBeNull();
  });

  it("does not read arbitrary later media segments as a missing stream URI", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=9000000",
      "#EXT-X-TARGETDURATION:10",
      "#EXTINF:10,",
      "segment0001.ts",
    ].join("\n");
    expect(selectHighestBandwidthVariant(manifest)).toBeNull();
  });

  it("skips a malformed high variant and selects the highest complete lower variant", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=9000000",
      "#EXT-X-STREAM-INF:BANDWIDTH=1500000",
      "sd.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=2800000",
      "hd.m3u8",
    ].join("\r\n");
    expect(selectHighestBandwidthVariant(manifest)).toBe("hd.m3u8");
  });

  it("keeps normal well-formed highest-bandwidth selection", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=800000",
      "low.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=2800000",
      "hd.m3u8",
    ].join("\n");
    expect(selectHighestBandwidthVariant(manifest)).toBe("hd.m3u8");
  });
});

import { describe, expect, it } from "vitest";

import { selectHighestBandwidthVariant } from "./hlsOfflineManifest";

describe("AG3-OFF-020 unsafe HLS master variant protocols", () => {
  it("does not select a higher-bandwidth file URI instead of the safe variant", () => {
    const playlist = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=9000000",
      "file:///private/var/mobile/private.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=1200000",
      "mobile-safe.m3u8",
    ].join("\n");
    expect(selectHighestBandwidthVariant(playlist)).toBe("mobile-safe.m3u8");
  });

  it.each([
    "data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQ==",
    "javascript:alert(1)",
    "blob:https://cdn.example/private",
    "ftp://cdn.example/variant.m3u8",
    "content://media/external/video/123",
  ])("rejects a manifest with only unsupported scheme %s", (uri) => {
    const manifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000\n${uri}`;
    expect(selectHighestBandwidthVariant(manifest)).toBeNull();
  });

  it("keeps a full signed HTTPS CDN URI, including query characters", () => {
    const signed =
      "https://cdn.example.org/master/1080p.m3u8?X-Amz-Expires=60&X-Amz-Signature=safe-fixture";
    const manifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\n${signed}`;
    expect(selectHighestBandwidthVariant(manifest)).toBe(signed);
  });

  it("keeps a legitimate protocol-relative CDN variant URI", () => {
    const manifest = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\n//cdn.example.org/hd.m3u8";
    expect(selectHighestBandwidthVariant(manifest)).toBe("//cdn.example.org/hd.m3u8");
  });

  it("retains both relative paths and explicit HTTP variants", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=100000",
      "hls/low.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=300000",
      "http://cdn.example.org/hd.m3u8",
    ].join("\n");
    expect(selectHighestBandwidthVariant(manifest)).toBe("http://cdn.example.org/hd.m3u8");
  });

  it("skips the unsupported highest variant even with CRLF master formatting", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=9000000",
      "ftp://cdn.example.org/ultra.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=2000000",
      "hd.m3u8",
    ].join("\r\n");
    expect(selectHighestBandwidthVariant(manifest)).toBe("hd.m3u8");
  });
});

import { describe, expect, it } from "vitest";

import { canLoadHlsQualityVariants, parseHlsQualityVariants } from "./hlsQuality";

describe("parseHlsQualityVariants", () => {
  it("читает варианты с разрешением и превращает относительные URL в абсолютные", () => {
    const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8`;

    expect(
      parseHlsQualityVariants(manifest, "https://api.gafus.ru/video/1/master.m3u8?token=x"),
    ).toEqual([
      {
        id: "https://api.gafus.ru/video/1/720p.m3u8",
        label: "720p",
        height: 720,
        bandwidth: 2_500_000,
        uri: "https://api.gafus.ru/video/1/720p.m3u8",
      },
      {
        id: "https://api.gafus.ru/video/1/360p.m3u8",
        label: "360p",
        height: 360,
        bandwidth: 700_000,
        uri: "https://api.gafus.ru/video/1/360p.m3u8",
      },
    ]);
  });

  it("понимает NAME из текущего master playlist сервера", () => {
    const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3120000,AVERAGE-BANDWIDTH=2628000,NAME="720p"
https://api.gafus.ru/api/v1/training/video/1/segment?token=x&path=720p.m3u8`;

    expect(
      parseHlsQualityVariants(manifest, "https://api.gafus.ru/manifest.m3u8")[0],
    ).toMatchObject({
      label: "720p",
      height: 720,
      bandwidth: 3_120_000,
    });
  });
});

describe("canLoadHlsQualityVariants", () => {
  it("загружает только сетевые HLS-манифесты", () => {
    expect(canLoadHlsQualityVariants("https://api.gafus.ru/manifest.m3u8?token=x")).toBe(true);
    expect(canLoadHlsQualityVariants("file:///offline/manifest.m3u8")).toBe(false);
    expect(canLoadHlsQualityVariants("https://cdn.gafus.ru/video.mp4")).toBe(false);
  });
});

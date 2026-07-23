import { describe, expect, it, vi } from "vitest";

import { rewriteHlsManifest } from "./hlsManifest";

describe("rewriteHlsManifest", () => {
  it("rewrites media segments and master playlist variants", async () => {
    const resolve = vi.fn(async (uri: string) => `https://signed.example/${uri}`);
    const source = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=1000000",
      "360p.m3u8",
      '#EXT-X-MAP:URI="init.mp4"',
      "segment-001.ts",
    ].join("\n");

    await expect(rewriteHlsManifest(source, resolve)).resolves.toContain(
      "https://signed.example/360p.m3u8",
    );
    await expect(rewriteHlsManifest(source, resolve)).resolves.toContain(
      'URI="https://signed.example/init.mp4"',
    );
    expect(resolve).toHaveBeenCalledWith("segment-001.ts");
  });
});

import { describe, expect, it, vi } from "vitest";
import { signFeedHlsManifest } from "./playlist.js";
const playlist = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:2",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXT-X-MEDIA-SEQUENCE:0",
  "#EXT-X-INDEPENDENT-SEGMENTS",
  "#EXTINF:2.000000,",
  "segment-000.ts",
  "#EXTINF:2.000000,",
  "segment-001.ts",
  "#EXT-X-ENDLIST",
].join("\n");
const now = new Date("2026-10-09T11:00:00.000Z");
function make(overrides: Record<string, unknown> = {}) {
  const sign = vi.fn(async (key: string) =>
    `https://media.example.test/${key}?token=signature`);
  return {
    manifest: playlist,
    ownerId: "user_1",
    postId: "post_1",
    mediaId: "media_1",
    expiresAt: new Date(now.getTime() + 120_000),
    now: () => now,
    allowedCdnHost: "media.example.test",
    sign,
    ...overrides,
  };
}
describe("private signed HLS manifest", () => {
  it("replaces every segment with its individually signed URL", async () => {
    const request = make();
    const rendered = await signFeedHlsManifest(request);
    expect(rendered.playlist).toContain("https://media.example.test/posts/user_1/post_1/attachments/media_1/hls/segment-000.ts?token=signature");
    expect(rendered.playlist).toContain("segment-001.ts?token=signature");
    expect(rendered.playlist).toContain("#EXT-X-ENDLIST");
    expect(request.sign).toHaveBeenCalledTimes(2);
    expect(rendered.expiresAt).toBe(request.expiresAt.toISOString());
  });
  it("refuses tokens longer than two minutes and already expired", async () => {
    await expect(signFeedHlsManifest(make({
      expiresAt: new Date(now.getTime() + 120_001),
    }))).rejects.toThrow("VIDEO_TICKET_EXPIRED");
    await expect(signFeedHlsManifest(make({ expiresAt: now }))).rejects.toThrow("VIDEO_TICKET_EXPIRED");
  });
  it("rejects malicious keys, remote playlist URIs and injected HLS tags", async () => {
    for (const bad of [
      playlist.replace("segment-000.ts", "../secret.ts"),
      playlist.replace("segment-000.ts", "https://evil.test/segment-000.ts"),
      playlist.replace("#EXT-X-TARGETDURATION:2", '#EXT-X-KEY:METHOD=AES-128,URI="https://evil.test/key"'),
    ]) {
      await expect(signFeedHlsManifest(make({ manifest: bad }))).rejects.toThrow();
    }
    await expect(signFeedHlsManifest(make({ mediaId: "../escape" }))).rejects.toThrow("VIDEO_MEDIA_ID");
  });
  it("rejects a signer redirecting to an untrusted host or insecure transport", async () => {
    for (const url of ["https://evil.example/segment-000.ts", "http://media.example.test/segment-000.ts"]) {
      await expect(signFeedHlsManifest(make({ sign: async () => url })))
        .rejects.toThrow("VIDEO_CDN_SIGNATURE");
    }
  });
});

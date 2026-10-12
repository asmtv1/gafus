import { describe, expect, it, vi } from "vitest";
import { createFeedPlayback } from "./playback.js";
const key = new Uint8Array(32).fill(9);
const prefix = "posts/owner/post/attachments/media/hls/";
const raw = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.0,\nsegment-000.ts\n#EXT-X-ENDLIST\n";
function setup() {
  let at = new Date("2026-10-09T12:00:00Z");
  const source = { ownerId: "owner", postId: "post", mediaId: "media", playlistKey: prefix + "playlist.m3u8", segmentKeys: [prefix + "segment-000.ts"] };
  const posts = { playbackSource: vi.fn(async () => source) };
  const storage = { readPlaylist: vi.fn(async () => raw), signCdn: vi.fn(async ({ key }: { key: string }) => `https://cdn.test/${key}?md5=signed`) };
  return { playback: createFeedPlayback({ posts, storage, key, cdnHost: "cdn.test", now: () => at }), posts, storage,
    advance: (ms: number) => { at = new Date(at.getTime() + ms); }, source };
}
describe("feed playback tickets and manifests", () => {
  it("issues a ticket only after core authorization and signs every segment", async () => {
    const { playback, posts, storage } = setup();
    const ticket = await playback.ticket("viewer", "media");
    expect(posts.playbackSource).toHaveBeenCalledWith("viewer", "media");
    expect(ticket.manifestUrl).toMatch(/^\/api\/v1\/feed-playback\/media\?ticket=/);
    const result = await playback.manifest("media", ticket.ticket, "viewer");
    expect(result.playlist).toContain(`https://cdn.test/${prefix}segment-000.ts?md5=signed`);
    expect(storage.signCdn).toHaveBeenCalledTimes(1);
  });
  it("rejects another account, media id, expired ticket, and changed signature", async () => {
    const { playback, advance, storage } = setup(); const { ticket } = await playback.ticket("viewer", "media");
    await expect(playback.manifest("media", ticket, "other")).rejects.toMatchObject({ status: 404 });
    await expect(playback.manifest("other", ticket)).rejects.toMatchObject({ status: 404 });
    await expect(playback.manifest("media", ticket.slice(0, -3) + "xxx")).rejects.toMatchObject({ status: 404 });
    advance(120_000);
    await expect(playback.manifest("media", ticket)).rejects.toMatchObject({ status: 404 });
    expect(storage.readPlaylist).not.toHaveBeenCalled();
  });
  it("rechecks deleted/replaced media when a bearer manifest is requested", async () => {
    const { playback, posts, storage } = setup(); const { ticket } = await playback.ticket("viewer", "media");
    posts.playbackSource.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(playback.manifest("media", ticket)).rejects.toThrow("NOT_FOUND");
    expect(storage.readPlaylist).not.toHaveBeenCalled();
  });
  it("rejects a playlist that differs from the accepted database output", async () => {
    const { playback, source } = setup(); const { ticket } = await playback.ticket("viewer", "media");
    source.segmentKeys = [prefix + "segment-001.ts"];
    await expect(playback.manifest("media", ticket)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects a source object masquerading as a playlist", async () => {
    const { playback, source, storage } = setup(); const { ticket } = await playback.ticket("viewer", "media");
    source.playlistKey = "posts/owner/post/incoming/upload/source.mp4";
    await expect(playback.manifest("media", ticket)).rejects.toMatchObject({ status: 404 });
    expect(storage.readPlaylist).not.toHaveBeenCalled();
  });
  it("signs every HLS segment on Cloud.ru only after fresh core authorization", async () => {
    const initial = setup();
    const fallbackSign = vi.fn(async (objectKey: string, ttl: number) =>
      `https://s3.cloud.ru/gafus-feed-private/${objectKey}?X-Amz-Expires=${ttl}&X-Amz-Signature=test`);
    const playback = createFeedPlayback({
      posts: initial.posts, storage: initial.storage, key, cdnHost: "cdn.test",
      fallbackSign, now: () => new Date("2026-10-09T12:00:00Z"),
    });
    const ticket = await playback.ticket("viewer", "media");
    const manifest = await playback.manifest("media", ticket.ticket, "viewer", "cloudru");
    expect(manifest.playlist).toContain(`https://s3.cloud.ru/gafus-feed-private/${prefix}segment-000.ts?`);
    expect(fallbackSign).toHaveBeenCalledWith(prefix + "segment-000.ts", 120);
    expect(initial.posts.playbackSource).toHaveBeenCalledTimes(2);
    await expect(playback.manifest("media", ticket.ticket, "different", "cloudru"))
      .rejects.toMatchObject({ status: 404 });
    expect(fallbackSign).toHaveBeenCalledTimes(1);
  });
  it("rejects direct S3 playback without explicitly configured signer", async () => {
    const { playback } = setup();
    const { ticket } = await playback.ticket("viewer", "media");
    await expect(playback.manifest("media", ticket, "viewer", "cloudru"))
      .rejects.toMatchObject({ status: 503 });
  });
  it("does not issue tickets for inaccessible media", async () => {
    const { playback, posts } = setup(); posts.playbackSource.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(playback.ticket("viewer", "media")).rejects.toThrow("NOT_FOUND");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginBegetCdnPurge, begetCdnPurgeDone, isBegetCacheableObjectKey } from "./begetCdnPurge";
const baseline = { ...process.env };
beforeEach(() => {
  process.env = { ...baseline };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function enabled() {
  process.env.BEGET_CDN_PURGE_API_VERIFIED = "true";
  process.env.BEGET_CDN_CACHE_KEY_VERIFIED = "true";
  process.env.BEGET_CDN_API_TOKEN = "mock-token-test-only-000000000000000";
  process.env.GALLERY_BEGET_CDN_SERVICE_ID = "0a8e97d5-3a65-4e90-99a6-c7f61131a461";
}
describe("Beget exact-path purge", () => {
  it("fails closed without verified Beget API credentials and expected service ID", async () => {
    await expect(beginBegetCdnPurge("gallery", ["/albums/a/b/photos/c/thumb.webp"], []))
      .rejects.toThrow("BEGET_CDN_PURGE_NOT_VERIFIED");
    enabled();
    process.env.GALLERY_BEGET_CDN_SERVICE_ID = "unrelated-service";
    await expect(beginBegetCdnPurge("gallery", ["/albums/a/b/photos/c/thumb.webp"], []))
      .rejects.toThrow("BEGET_CDN_PURGE_NOT_VERIFIED");
  });
  it("rejects wildcards, prefixes and foreign or unsafe paths before HTTP", async () => {
    enabled();
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    for (const path of ["/*", "/albums/*", "/albums/a/../b", "/posts/a/b/attachments/x/full.webp", "/albums/a//b", "albums/a/b"]) {
      await expect(beginBegetCdnPurge("gallery", [path], []))
        .rejects.toThrow("BEGET_CDN_UNSAFE_PATH");
    }
    expect(network).not.toHaveBeenCalled();
  });
  it("posts scoped exact paths to Beget API, checkpoints and never repeats a known submission", async () => {
    enabled();
    const network = vi.fn().mockResolvedValue(Response.json({ cdn: { id: "0a8e97d5-3a65-4e90-99a6-c7f61131a461" } }));
    vi.stubGlobal("fetch", network);
    const checkpoint = vi.fn();
    const path = "/albums/a/b/photos/c/thumb.webp";
    const ops = await beginBegetCdnPurge("gallery", [path], [], checkpoint);
    expect(network).toHaveBeenCalledWith(
      "https://api.beget.com/v1/cloud/cdn/0a8e97d5-3a65-4e90-99a6-c7f61131a461/purge-cache-by-paths",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ service_id: "0a8e97d5-3a65-4e90-99a6-c7f61131a461", path: [path] }) }),
    );
    expect(ops[0]).toMatch(/^beget:[a-f0-9]{64}:\d{13}:gallery:[A-Za-z0-9_-]+$/);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(await beginBegetCdnPurge("gallery", [path], ops)).toEqual(ops);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("cannot purge source uploads, missing extensions, medical originals or playlists", () => {
    expect(isBegetCacheableObjectKey("gallery", "albums/a/b/photos/c/full.webp")).toBe(true);
    expect(isBegetCacheableObjectKey("gallery", "users/a/pets/b/vet-visits/c/d/thumb.webp")).toBe(true);
    for (const key of ["albums/a/b", "albums/a/b/incoming/c/source.jpg", "users/a/pets/b/vet-visits/c/d/original.pdf"])
      expect(isBegetCacheableObjectKey("gallery", key)).toBe(false);
    expect(isBegetCacheableObjectKey("feed", "posts/a/b/attachments/c/hls/playlist.m3u8")).toBe(false);
    expect(isBegetCacheableObjectKey("feed", "posts/a/b/attachments/c/hls/segment-001.ts")).toBe(true);
  });
  it("does not confuse API acknowledgment with confirmed deletion at CDN edge", async () => {
    enabled();
    const now = Date.now();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ cdn: { id: '0a8e97d5-3a65-4e90-99a6-c7f61131a461' } })));
    const [op] = await beginBegetCdnPurge('gallery', ['/albums/a/b/photos/c/full.webp'], []);
    expect(op).toBeTruthy();
    const verified = { ...process.env, BEGET_CDN_PURGE_PROPAGATION_VERIFIED: 'true',
      GALLERY_CDN_SECRET: 'A'.repeat(32),
      GALLERY_CDN_BASE_URL: 'https://mepsuduyokabib.begetcdn.cloud' };
    await expect(begetCdnPurgeDone(op!, now + 301_000)).rejects.toThrow('BEGET_CDN_PURGE_NOT_VERIFIED');
    const edge = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await begetCdnPurgeDone(op!, now + 100_000, verified, edge)).toBe(false);
    expect(edge).not.toHaveBeenCalled();
    expect(await begetCdnPurgeDone(op!, now + 400_000, verified, edge)).toBe(true);
    expect(edge).toHaveBeenCalledTimes(2);
    expect(edge.mock.calls.map(call => call[1].method)).toEqual(['HEAD', 'GET']);
    const signedUrl: string = edge.mock.calls[0]![0];
    expect(signedUrl).toMatch(/^https:\/\/mepsuduyokabib\.begetcdn\.cloud\/md5\([A-Za-z0-9_-]{22},\d{10}\)\/albums\/a\/b\/photos\/c\/full\.webp$/);
    expect(signedUrl).not.toContain(verified.GALLERY_CDN_SECRET);
    // Gallery's already-provisioned production key may be longer than 32
    // characters. Purge verification must not force key rotation.
    expect(await begetCdnPurgeDone(op!, now + 400_000, {
      ...verified, GALLERY_CDN_SECRET: 'B'.repeat(64),
    }, edge)).toBe(true);
    edge.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
    expect(await begetCdnPurgeDone(op!, now + 400_000, verified, edge)).toBe(false);
    edge.mockReset().mockResolvedValue(new Response(null, { status: 410 }));
    expect(await begetCdnPurgeDone(op!, now + 400_000, verified, edge)).toBe(false);
    await expect(begetCdnPurgeDone('beget:' + 'a'.repeat(64) + ':1800000000000', now + 400_000, verified, edge))
      .rejects.toThrow('BEGET_CDN_UNSAFE_OPERATION');
    await expect(begetCdnPurgeDone(op!.replace('gallery:', 'feed:'), now + 400_000, verified, edge))
      .rejects.toThrow('BEGET_CDN_UNSAFE_OPERATION');
  });
  it("fails closed on an unrecognized success response", async () => {
    enabled();
    for (const response of [{ error: { code: 1 } }, {}, { status: "ok" }]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
      await expect(beginBegetCdnPurge("gallery", ["/albums/a/b/photos/c/thumb.webp"], []))
        .rejects.toThrow("BEGET_CDN_PURGE_RESPONSE_UNVERIFIED");
    }
  });
});

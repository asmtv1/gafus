import { createHash } from "node:crypto";
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
  process.env.GALLERY_BEGET_CDN_SERVICE_ID = "96cd124e-767e-4af1-a568-c4d1f9b4e73f";
  process.env.GALLERY_CDN_REDIRECT_SIGNING_SECRET = "N".repeat(32);
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
    const network = vi.fn().mockResolvedValue(Response.json({ cdn: { id: "96cd124e-767e-4af1-a568-c4d1f9b4e73f" } }));
    vi.stubGlobal("fetch", network);
    const checkpoint = vi.fn();
    const path = "/albums/a/b/photos/c/thumb.webp";
    const ops = await beginBegetCdnPurge("gallery", [path], [], checkpoint);
    expect(network).toHaveBeenCalledWith(
      "https://api.beget.com/v1/cloud/cdn/96cd124e-767e-4af1-a568-c4d1f9b4e73f/purge-cache-by-paths",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ service_id: "96cd124e-767e-4af1-a568-c4d1f9b4e73f", path: [path] }) }),
    );
    expect(ops[0]).toMatch(/^beget:[a-f0-9]{64}:\d{13}:gallery:[A-Za-z0-9_-]+$/);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(await beginBegetCdnPurge("gallery", [path], ops)).toEqual(ops);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("cannot purge source uploads, missing extensions, medical originals or playlists", () => {
    expect(isBegetCacheableObjectKey("gallery", "albums/a/b/photos/c/full.webp")).toBe(true);
    expect(isBegetCacheableObjectKey("gallery", "gallery/a/media/p/v2/thumb.webp")).toBe(true);
    expect(isBegetCacheableObjectKey("gallery", "gallery/a/media/p/v2/full.webp")).toBe(true);
    expect(isBegetCacheableObjectKey("gallery", "gallery/a/media/p/v2/source.jpg")).toBe(false);
    expect(isBegetCacheableObjectKey("gallery", "gallery/a/media/p/v2/full.webp/more")).toBe(false);
    expect(isBegetCacheableObjectKey("gallery", "users/a/pets/b/vet-visits/c/d/thumb.webp")).toBe(true);
    for (const key of ["albums/a/b", "albums/a/b/incoming/c/source.jpg", "users/a/pets/b/vet-visits/c/d/original.pdf"])
      expect(isBegetCacheableObjectKey("gallery", key)).toBe(false);
    expect(isBegetCacheableObjectKey("feed", "posts/a/b/attachments/c/hls/playlist.m3u8")).toBe(false);
    expect(isBegetCacheableObjectKey("feed", "posts/a/b/attachments/c/hls/segment-001.ts")).toBe(false);
    for (const key of ["media/v2/c/v1/image/s.webp", "media/v2/c/v1/image/m.webp",
      "media/v2/c/v1/image/l.webp", "media/v2/c/v1/poster.webp", "media/v2/c/v1/video/360.mp4",
      "media/v2/c/v1/video/720.mp4", "media/v2/c/v1/video/1080.mp4"])
      expect(isBegetCacheableObjectKey("feed", key)).toBe(true);
    expect(isBegetCacheableObjectKey("feed", "media/v2/c/v1/video/360.m3u8")).toBe(false);
  });
  it("accepts exact Gallery V2 WebP paths for guarded Beget purge submissions", async () => {
    enabled();
    const network = vi.fn().mockResolvedValue(Response.json({ cdn: {
      id: "96cd124e-767e-4af1-a568-c4d1f9b4e73f",
    } }));
    vi.stubGlobal("fetch", network);
    const keys = ["/gallery/owner/media/photo/v2/thumb.webp",
      "/gallery/owner/media/photo/v2/full.webp"];
    const operations = await beginBegetCdnPurge("gallery", keys, []);
    expect(operations).toHaveLength(1);
    expect(network).toHaveBeenCalledWith(expect.stringContaining("api.beget.com"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          service_id: "96cd124e-767e-4af1-a568-c4d1f9b4e73f", path: keys,
        }),
      }));
  });
  it("does not confuse API acknowledgment with confirmed deletion at CDN edge", async () => {
    enabled();
    const now = Date.now();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ cdn: { id: '96cd124e-767e-4af1-a568-c4d1f9b4e73f' } })));
    const [op] = await beginBegetCdnPurge('gallery', ['/albums/a/b/photos/c/full.webp'], []);
    expect(op).toBeTruthy();
    const verified = { ...process.env, BEGET_CDN_PURGE_PROPAGATION_VERIFIED: 'true',
      GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'A'.repeat(32),
      GALLERY_CDN_BASE_URL: 'https://fupiquafifeswu.begetcdn.cloud' };
    await expect(begetCdnPurgeDone(op!, now + 301_000)).rejects.toThrow('BEGET_CDN_PURGE_NOT_VERIFIED');
    const edge = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await begetCdnPurgeDone(op!, now + 100_000, verified, edge)).toBe(false);
    expect(edge).not.toHaveBeenCalled();
    expect(await begetCdnPurgeDone(op!, now + 400_000, verified, edge)).toBe(true);
    expect(edge).toHaveBeenCalledTimes(2);
    expect(edge.mock.calls.map(call => call[1].method)).toEqual(['HEAD', 'GET']);
    const signedUrl: string = edge.mock.calls[0]![0];
    expect(signedUrl).toMatch(/^https:\/\/fupiquafifeswu\.begetcdn\.cloud\/md5\([A-Za-z0-9_-]{22},\d{10}\)\/albums\/a\/b\/photos\/c\/full\.webp$/);
    expect(signedUrl).not.toContain(verified.GALLERY_CDN_REDIRECT_SIGNING_SECRET);
    // Gallery's already-provisioned production key may be longer than 32
    // characters. Purge verification must not force key rotation.
    expect(await begetCdnPurgeDone(op!, now + 400_000, {
      ...verified, GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'B'.repeat(64),
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
  it("verifies only exact new Feed WebP/MP4 paths using Beget query Secure Token", async () => {
    enabled();
    process.env.FEED_BEGET_CDN_SERVICE_ID = "cbb7fe86-a193-457e-a756-9cf3aa2aef1b";
    const api = vi.fn().mockResolvedValue(Response.json({ cdn: { id: process.env.FEED_BEGET_CDN_SERVICE_ID } }));
    vi.stubGlobal("fetch", api);
    const path = "/media/v2/sample/v1/video/360.mp4";
    const [op] = await beginBegetCdnPurge("feed", [path], []);
    expect(op).toMatch(/^beget:[a-f0-9]{64}:\d{13}:feed:/);
    const edge = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const now = Date.now() + 400_000;
    const secret = "M".repeat(28);
    const verified = { ...process.env, BEGET_CDN_PURGE_PROPAGATION_VERIFIED: "true",
      FEED_CDN_SECRET: secret, FEED_CDN_BASE_URL: "https://quepraquiecebquomiel.begetcdn.cloud" };
    expect(await begetCdnPurgeDone(op!, now, verified, edge)).toBe(true);
    const url = new URL(edge.mock.calls[0]![0]);
    const expires = Number(url.searchParams.get("expires"));
    const md5 = createHash("md5").update(`${expires}${path} ${secret}`).digest("base64url");
    expect(url.pathname).toBe(path);
    expect(url.search).toBe(`?md5=${md5}&expires=${expires}`);
    expect(edge.mock.calls.map((call: unknown[]) => (call[1] as { method: string }).method)).toEqual(["HEAD", "GET"]);
    expect(url.href).not.toContain(secret);
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

describe("Gallery SigV4 Hono redirect CDN purge", () => {
  it("only purges the new service, deduplicates receipts and verifies its signed edge", async () => {
    enabled();
    Object.assign(process.env, {
      GALLERY_CDN_BASE_URL: "https://fupiquafifeswu.begetcdn.cloud",
      BEGET_CDN_PURGE_PROPAGATION_VERIFIED: "true",
    });
    const api = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ cdn: { id: "accepted" } }));
    vi.stubGlobal("fetch", api);
    const checkpoint = vi.fn();
    const paths = ["/albums/a/b/photos/p/thumb.webp"];
    const ops = await beginBegetCdnPurge("gallery", paths, [], checkpoint);
    expect(ops).toHaveLength(1);
    expect(api).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(String(api.mock.calls[0]![0])).toContain("/96cd124e-767e-4af1-a568-c4d1f9b4e73f/");
    expect(await beginBegetCdnPurge("gallery", paths, ops)).toEqual(ops);
    expect(api).toHaveBeenCalledTimes(1);
    const edge = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 404 }));
    expect(await begetCdnPurgeDone(ops[0]!, Date.now() + 400000, { ...process.env }, edge)).toBe(true);
    expect(edge).toHaveBeenCalledTimes(2);
    expect(String(edge.mock.calls[0]![0])).toContain("fupiquafifeswu.begetcdn.cloud");
    edge.mockReset().mockResolvedValue(new Response(null, { status: 410 }));
    expect(await begetCdnPurgeDone(ops[0]!, Date.now() + 400000, { ...process.env }, edge)).toBe(false);
  });
});

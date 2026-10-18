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
    expect(isBegetCacheableObjectKey("feed", "posts/a/b/attachments/c/hls/playlist.m3u8")).toBe(true);
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
  it('Gallery cutover purges old and new CDN and verifies both receipts', async () => {
    enabled();
    Object.assign(process.env, {
      GALLERY_CDN_REDIRECT_ENABLED: 'true',
      GALLERY_CDN_BASE_URL: 'https://dikinuneceswe.begetcdn.cloud',
      GALLERY_CDN_EDGE_TOKEN_VERIFIED: 'true',
      GALLERY_BEGET_CDN_SERVICE_ID: '10530e64-21b7-4352-8366-806c79c2f1b7',
      GALLERY_CDN_SECRET: 'R'.repeat(32),
      GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'N'.repeat(32),
      GALLERY_CDN_PURGE_DUAL_ENABLED: 'true',
      BEGET_CDN_PURGE_PROPAGATION_VERIFIED: 'true',
    });
    const req=vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ cdn: { id: 'accepted' } }));
    vi.stubGlobal('fetch', req);
    const path='/albums/o/a/photos/p/full.webp';
    const ops=await beginBegetCdnPurge('gallery',[path],[]);
    expect(ops).toHaveLength(2);
    const calls=req.mock.calls.map(call=>String(call[0]));
    expect(calls.some(url=>url.includes('/0a8e97d5-3a65-4e90-99a6-c7f61131a461/'))).toBe(true);
    expect(calls.some(url=>url.includes('/10530e64-21b7-4352-8366-806c79c2f1b7/'))).toBe(true);
    expect(await beginBegetCdnPurge('gallery',[path],ops)).toEqual(ops);
    expect(req).toHaveBeenCalledTimes(2);
    const edge=vi.fn(async (_url: RequestInfo | URL) => new Response(null,{status:404}));
    expect(await begetCdnPurgeDone(ops[0]!, Date.now()+400_000, { ...process.env }, edge)).toBe(true);
    expect(await begetCdnPurgeDone(ops[1]!, Date.now()+400_000, { ...process.env }, edge)).toBe(true);
    expect(edge.mock.calls.some(call=>String(call[0]).includes('mepsuduyokabib.begetcdn.cloud'))).toBe(true);
    expect(edge.mock.calls.some(call=>String(call[0]).includes('dikinuneceswe.begetcdn.cloud'))).toBe(true);
    await expect(begetCdnPurgeDone(ops[1]!, Date.now()+400_000, {
      ...process.env, GALLERY_CDN_REDIRECT_ENABLED: 'false',
      GALLERY_BEGET_CDN_SERVICE_ID: '0a8e97d5-3a65-4e90-99a6-c7f61131a461',
      GALLERY_CDN_BASE_URL: 'https://mepsuduyokabib.begetcdn.cloud',
    }, edge)).resolves.toBe(true);
  });
  it("purges and verifies only the new public Feed CDN by unsigned exact paths", async () => {
    enabled();
    process.env.FEED_BUCKET_PUBLIC = "true";
    process.env.FEED_CDN_BASE_URL = "https://new-feed.begetcdn.cloud";
    process.env.FEED_BEGET_CDN_SERVICE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const request = vi.fn().mockResolvedValue(Response.json({ cdn: { id: process.env.FEED_BEGET_CDN_SERVICE_ID } }));
    vi.stubGlobal("fetch", request);
    const path = "/posts/owner/post/attachments/m/hls/playlist.m3u8";
    const [op] = await beginBegetCdnPurge("feed", [path], []);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/purge-cache-by-paths"),
      expect.objectContaining({ body: JSON.stringify({ service_id: process.env.FEED_BEGET_CDN_SERVICE_ID, path: [path] }) }));
    const verified = { ...process.env, BEGET_CDN_PURGE_PROPAGATION_VERIFIED: "true", FEED_CDN_SECRET: "" };
    const edge = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(null, { status: 404 }));
    expect(await begetCdnPurgeDone(op!, Date.now() + 400_000, verified, edge)).toBe(true);
    expect(edge).toHaveBeenCalledTimes(2);
    expect(edge.mock.calls[0]![0]).toBe("https://new-feed.begetcdn.cloud" + path);
    expect(edge.mock.calls[1]![1]).toMatchObject({ method: "GET", redirect: "manual" });
    for (const changed of [
      { FEED_BEGET_CDN_SERVICE_ID: "becd9e5d-4fa8-47da-878c-9b80ded74e71" },
      { FEED_CDN_BASE_URL: "https://garaquachegasourn.begetcdn.cloud" },
      { FEED_CDN_BASE_URL: "https://evil.test" },
    ]) {
      await expect(begetCdnPurgeDone(op!, Date.now() + 400_000, { ...verified, ...changed }, edge))
        .rejects.toThrow();
    }
    // A legacy signed purge operation must never be mistaken for an operation
    // against the new public CDN service ID.
    await expect(begetCdnPurgeDone(op!, Date.now() + 400_000,
      { ...verified, FEED_BUCKET_PUBLIC: "false", FEED_BEGET_CDN_SERVICE_ID: "becd9e5d-4fa8-47da-878c-9b80ded74e71" }, edge))
      .rejects.toThrow("BEGET_CDN_UNSAFE_OPERATION");
  });
  it("isolates Questions photo purge to its verified public CDN service", async () => {
    enabled();
    const key = "questions/uploads/questions/owner/image-name.jpg";
    expect(isBegetCacheableObjectKey("questions",
      "questions/uploads/questions/owner/image-name/full.webp")).toBe(true);
    expect(isBegetCacheableObjectKey("questions",
      "questions/uploads/questions/owner/image-name/thumb.webp")).toBe(true);
    expect(isBegetCacheableObjectKey("questions", key)).toBe(true);
    for (const unsafe of ["questions/uploads/questions/a/../x.jpg", "questions/uploads/questions/a/b.pdf",
      "posts/a/b/attachments/c/thumb.webp"]) {
      expect(isBegetCacheableObjectKey("questions", unsafe)).toBe(false);
    }
    const config = {
      QUESTIONS_CDN_BASE_URL: "https://ebiteskukingusk.begetcdn.cloud",
      QUESTIONS_PUBLIC_S3_BUCKET: "gafus-questions-public",
      QUESTIONS_CDN_LIVE_VERIFIED: "true",
      QUESTIONS_BEGET_CDN_SERVICE_ID: "3c2a1623-50a1-46a1-b7a4-bb1093eaedf0",
      BEGET_CDN_PURGE_PROPAGATION_VERIFIED: "true",
    };
    Object.assign(process.env, config);
    const request = vi.fn().mockResolvedValue(Response.json({ cdn: { id: config.QUESTIONS_BEGET_CDN_SERVICE_ID } }));
    vi.stubGlobal("fetch", request);
    const [operation] = await beginBegetCdnPurge("questions", ["/" + key], []);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/3c2a1623-50a1-46a1-b7a4-bb1093eaedf0/purge-cache-by-paths"),
      expect.objectContaining({ method: "POST" }),
    );
    const edge = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await begetCdnPurgeDone(operation!, Date.now() + 500_000, process.env, edge))
      .toBe(true);
    expect(edge.mock.calls.map(call => call[0])).toEqual([
      "https://ebiteskukingusk.begetcdn.cloud/" + key,
      "https://ebiteskukingusk.begetcdn.cloud/" + key,
    ]);
    edge.mockReset().mockResolvedValue(new Response(null, { status: 403 }));
    expect(await begetCdnPurgeDone(operation!, Date.now() + 500_000, process.env, edge))
      .toBe(false);
    await expect(begetCdnPurgeDone(operation!, Date.now() + 500_000,
      { ...process.env, QUESTIONS_CDN_LIVE_VERIFIED: "false" }, edge))
      .rejects.toThrow("BEGET_CDN_PURGE_NOT_VERIFIED");
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

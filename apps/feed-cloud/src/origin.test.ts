import { afterEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: class { send = send; }, GetObjectCommand: class {}, HeadObjectCommand: class {} }));
import { handler } from "./origin";
const key = "/media/v2/media_1/v1/image/l.webp";
const event = (path = key, httpMethod = "GET") => ({ path, httpMethod, headers: { "x-feed-origin-secret": "a".repeat(32) } });
afterEach(() => { vi.unstubAllEnvs(); send.mockReset(); });
function config() { vi.stubEnv("FEED_ORIGIN_SECRET", "a".repeat(32)); vi.stubEnv("FEED_BUCKET", "feed-private-test"); }
describe("private Feed origin", () => {
  it("denies unauthenticated requests before storage", async () => {
    config(); expect((await handler({ ...event(), headers: {} })).statusCode).toBe(403); expect(send).not.toHaveBeenCalled();
  });
  it("denies incoming sources, cross-scope paths and writes", async () => {
    config();
    for (const path of [key.replace("l.webp", "source.jpg"), "/albums/user/album/full.webp"]) expect((await handler(event(path))).statusCode).toBe(404);
    expect((await handler(event(key, "POST"))).statusCode).toBe(405); expect(send).not.toHaveBeenCalled();
  });
  it("serves bounded MP4 byte ranges and rejects all HLS paths", async () => {
    config();
    const path = "/media/v2/media_1/v1/video/360.mp4";
    const header = { ...event(path).headers, Range: "bytes=100-199" };
    send.mockResolvedValueOnce({ ContentLength: 10_000, ContentType: "video/mp4" });
    send.mockResolvedValueOnce({ ContentLength: 100, ContentType: "video/mp4",
      Body: (async function* () { yield Buffer.alloc(100, 7); })() });
    expect(await handler({ ...event(path), headers: header })).toMatchObject({
      statusCode: 206, isBase64Encoded: true,
      headers: { "Content-Range": "bytes 100-199/10000", "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4", "Content-Length": "100" },
    });
    expect(send).toHaveBeenCalledTimes(2);
    const prohibited = ["/media/v2/media_1/v1/video/360.m3u8",
      "/posts/user_1/post_1/attachments/media_1/hls/playlist.m3u8",
      "/media/v2/media_1/v1/video/segment-000.ts"];
    for (const unsafe of prohibited) expect((await handler(event(unsafe))).statusCode).toBe(404);
  });
  it("returns 416 for invalid MP4 ranges and refuses too-large or incorrectly typed movies", async () => {
    config();
    const path = "/media/v2/media_1/v1/video/720.mp4";
    for (const range of ["bytes=1000-", "bytes=-0", "bytes=1-2,4-5"]) {
      send.mockResolvedValueOnce({ ContentLength: 1000, ContentType: "video/mp4" });
      expect(await handler({ ...event(path), headers: { ...event(path).headers, Range: range } }))
        .toMatchObject({ statusCode: 416, headers: { "Content-Range": "bytes */1000" } });
    }
    for (const wrong of [{ ContentLength: 200 * 1024 * 1024 + 1, ContentType: "video/mp4" },
      { ContentLength: 1000, ContentType: "application/octet-stream" }]) {
      send.mockResolvedValueOnce(wrong);
      expect((await handler(event(path))).statusCode).toBe(404);
    }
  });
  it("serves only bounded matching media with private cache headers", async () => {
    config(); send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() });
    expect(await handler(event())).toMatchObject({ statusCode: 200, body: "YWJj", isBase64Encoded: true, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  });
  it("keeps shared caching disabled until both edge HIT and token gates are verified", async () => {
    config();
    vi.stubEnv("FEED_CDN_EDGE_CACHE_HIT_VERIFIED", "true");
    send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() });
    const blocked = await handler(event());
    expect(blocked.headers["Cache-Control"]).toBe("private, no-store, max-age=0");
    vi.stubEnv("FEED_CDN_EDGE_TOKEN_VERIFIED", "true");
    send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() });
    const cached = await handler(event());
    expect(cached.headers["Cache-Control"]).toBe("public, max-age=600");
    expect((await handler({ ...event(), headers: {} })).headers["Cache-Control"])
      .toBe("private, no-store, max-age=0");
  });
  it("supports one bounded range and rejects malformed/unsatisfiable ranges", async () => {
    config();
    for (const [range, status, body] of [["bytes=1-2", 206, "YmM="], ["bytes=-2", 206, "YmM="], ["bytes=2-", 206, "Yw=="], ["bytes=8-", 416, ""], ["bytes=-0", 416, ""], ["bytes=0-1,2-3", 416, ""]] as const) {
      send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() });
      expect(await handler({ ...event(), headers: { ...event().headers, Range: range } })).toMatchObject({ statusCode: status, body });
    }
  });
  it("returns retryable 503 on S3 failures instead of negatively cacheable 404", async () => {
    config();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      send.mockRejectedValueOnce(Object.assign(new Error("S3 connection timed out"), { name: "TimeoutError" }));
      expect((await handler(event())).statusCode).toBe(503);
      send.mockRejectedValueOnce(Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } }));
      expect((await handler(event())).statusCode).toBe(404);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("connection timed out");
    } finally { spy.mockRestore(); }
  });
  it("rejects wrong MIME and truncated or oversized objects", async () => {
    config();
    for (const result of [{ ContentLength: 3, ContentType: "text/html" }, { ContentLength: 1_750_001, ContentType: "image/webp" }, { ContentLength: 5, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() }]) {
      send.mockResolvedValue(result); expect((await handler(event())).statusCode).toBe(404);
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: class { send = send; }, GetObjectCommand: class {}, HeadObjectCommand: class {} }));
import { handler } from "./origin";
const key = "/posts/user_1/post_1/attachments/media_1/full.webp";
const event = (path = key, httpMethod = "GET") => ({ path, httpMethod, headers: { "x-feed-origin-secret": "a".repeat(32) } });
afterEach(() => { vi.unstubAllEnvs(); send.mockReset(); });
function config() { vi.stubEnv("FEED_ORIGIN_SECRET", "a".repeat(32)); vi.stubEnv("FEED_BUCKET", "feed-private-test"); }
describe("private Feed origin", () => {
  it("denies unauthenticated requests before storage", async () => {
    config(); expect((await handler({ ...event(), headers: {} })).statusCode).toBe(403); expect(send).not.toHaveBeenCalled();
  });
  it("denies playlists, sources, album paths and writes", async () => {
    config();
    for (const path of [key.replace("full.webp", "hls/playlist.m3u8"), key.replace("full.webp", "source.jpg"), "/albums/user/album/full.webp"]) expect((await handler(event(path))).statusCode).toBe(404);
    expect((await handler(event(key, "POST"))).statusCode).toBe(405); expect(send).not.toHaveBeenCalled();
  });
  it("serves only bounded matching media with private cache headers", async () => {
    config(); send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() });
    expect(await handler(event())).toMatchObject({ statusCode: 200, body: "YWJj", isBase64Encoded: true, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  });
  it("supports one bounded range and rejects malformed/unsatisfiable ranges", async () => {
    config();
    for (const [range, status, body] of [["bytes=1-2", 206, "YmM="], ["bytes=-2", 206, "YmM="], ["bytes=2-", 206, "Yw=="], ["bytes=8-", 416, ""], ["bytes=-0", 416, ""], ["bytes=0-1,2-3", 416, ""]] as const) {
      send.mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() });
      expect(await handler({ ...event(), headers: { ...event().headers, Range: range } })).toMatchObject({ statusCode: status, body });
    }
  });
  it("rejects wrong MIME and truncated or oversized objects", async () => {
    config();
    for (const result of [{ ContentLength: 3, ContentType: "text/html" }, { ContentLength: 1_750_001, ContentType: "image/webp" }, { ContentLength: 5, ContentType: "image/webp", Body: (async function* () { yield Buffer.from("abc"); })() }]) {
      send.mockResolvedValue(result); expect((await handler(event())).statusCode).toBe(404);
    }
  });
});

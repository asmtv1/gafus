import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createFeedCloudObjects } from "./objects.js";
const key = "posts/owner/post/attachments/media/full.webp";
const bytes = new Uint8Array([1, 2, 3, 4]);
const etag = '"' + createHash("md5").update(bytes).digest("hex") + '"';
const env = {
  FEED_BUCKET: "gafus-feed-private", FEED_S3_ENDPOINT: "https://s3.cloud.ru",
  FEED_S3_ACCESS_KEY_ID: "tenant:fake", FEED_S3_SECRET_ACCESS_KEY: "test-only",
};
afterEach(() => vi.restoreAllMocks());
describe("Feed final-object S3 metadata", () => {
  it.each([
    ["true", "public, max-age=180, s-maxage=86400, must-revalidate"],
    ["false", "no-store"],
  ])("writes only immutable finished objects with correct cache metadata (public=%s)", async (mode, expected) => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: unknown) => {
      if (cmd instanceof PutObjectCommand) return {};
      if (cmd instanceof HeadObjectCommand) return {
        ETag: etag, ContentLength: bytes.byteLength, ContentType: "image/webp",
      };
      throw new Error("UNEXPECTED_S3_COMMAND");
    }) as never);
    const objects = createFeedCloudObjects({ ...env, FEED_BUCKET_PUBLIC: mode });
    await objects.create(key, bytes, "image/webp", new AbortController().signal);
    const put = send.mock.calls.find(([cmd]) => cmd instanceof PutObjectCommand)?.[0] as PutObjectCommand | undefined;
    expect(put?.input).toMatchObject({ Bucket: env.FEED_BUCKET, Key: key,
      CacheControl: expected, ContentType: "image/webp", IfNoneMatch: "*" });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("skips redundant HEAD after a verified immutable HLS segment PUT", async () => {
    const segmentKey = "posts/owner/post/attachments/media/hls/segment-000.ts";
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: unknown) => {
      if (cmd instanceof PutObjectCommand) return { ETag: etag };
      throw new Error("REDUNDANT_HEAD");
    }) as never);
    await createFeedCloudObjects(env).create(segmentKey, bytes, "video/mp2t", new AbortController().signal);
    expect(send).toHaveBeenCalledTimes(1);
    const put = send.mock.calls[0]![0] as PutObjectCommand;
    expect(put.input).toMatchObject({ Key: segmentKey, IfNoneMatch: "*", ContentType: "video/mp2t",
      ContentMD5: createHash("md5").update(bytes).digest("base64") });
  });
  it("retains HEAD integrity checks on conflicting or ambiguous uploads", async () => {
    const segmentKey = "posts/owner/post/attachments/media/hls/segment-001.ts";
    for (const mode of ["missing_etag", "different_etag", "conflict_412"] as const) {
      const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: unknown) => {
        if (cmd instanceof PutObjectCommand) {
          if (mode === "conflict_412") throw { $metadata: { httpStatusCode: 412 } };
          return { ETag: mode === "missing_etag" ? undefined : '"another-etag"' };
        }
        if (cmd instanceof HeadObjectCommand) return {
          ETag: etag, ContentLength: bytes.length, ContentType: "video/mp2t",
        };
        throw new Error("UNEXPECTED_S3_COMMAND");
      }) as never);
      await createFeedCloudObjects(env).create(segmentKey, bytes, "video/mp2t", new AbortController().signal);
      expect(send).toHaveBeenCalledTimes(2);
      send.mockRestore();
    }
  });
  it("rejects tampered HLS segment metadata after a conflicting PUT", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: unknown) => {
      if (cmd instanceof PutObjectCommand) throw { $metadata: { httpStatusCode: 409 } };
      if (cmd instanceof HeadObjectCommand) return {
        ETag: etag, ContentLength: bytes.length, ContentType: "image/webp",
      };
      throw new Error("UNEXPECTED_S3_COMMAND");
    }) as never);
    await expect(createFeedCloudObjects(env).create(
      "posts/owner/post/attachments/media/hls/segment-002.ts", bytes, "video/mp2t", new AbortController().signal,
    )).rejects.toThrow("IMMUTABLE_CONFLICT");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("streams a bounded conditional photo GET directly into memory", async () => {
    const signal = new AbortController().signal;
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: unknown) => {
      if (cmd instanceof GetObjectCommand) return {
        ETag: etag, ContentLength: bytes.length,
        Body: (async function* () { yield bytes.subarray(0, 2); yield bytes.subarray(2); })(),
      };
      throw new Error("UNEXPECTED_S3_COMMAND");
    }) as never);
    const result = await createFeedCloudObjects(env).read(
      "posts/owner/post/incoming/upload/source.jpg", 10 * 1024 * 1024, signal, etag);
    expect(result).toEqual(Buffer.from(bytes));
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as GetObjectCommand).input.IfMatch).toBe(etag);
  });
  it("rejects a dishonest source ContentLength without publishing", async () => {
    vi.spyOn(S3Client.prototype, "send").mockImplementation((async (cmd: unknown) => {
      if (cmd instanceof GetObjectCommand) return {
        ETag: etag, ContentLength: 1,
        Body: (async function* () { yield bytes; })(),
      };
      throw new Error("UNEXPECTED_S3_COMMAND");
    }) as never);
    await expect(createFeedCloudObjects(env).read(
      "posts/owner/post/incoming/upload/source.jpg", 10, new AbortController().signal, etag,
    )).rejects.toThrow("SOURCE_SIZE");
  });
  it("fails closed on other public buckets and unsafe incoming-output paths", async () => {
    expect(() => createFeedCloudObjects({ ...env, FEED_BUCKET: "other-bucket", FEED_BUCKET_PUBLIC: "true" }))
      .toThrow("INVALID_PUBLIC_FEED_BUCKET");
    await expect(createFeedCloudObjects({ ...env, FEED_BUCKET_PUBLIC: "true" }).create(
      "posts/owner/post/incoming/media/source.jpg", bytes, "image/webp", new AbortController().signal,
    )).rejects.toThrow("UNTRUSTED_FEED_FINAL_KEY");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  S3Client, CreateBucketCommand, PutObjectCommand, GetObjectCommand,
  DeleteObjectCommand, DeleteBucketCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { createFeedStorage, feedStorageConfigFromEnv } from "./storage.js";

/** Own MinIO on 127.0.0.1:9000, own scratch data, exact SDK config allowlist.
 * Default vitest runs skip this opt-in acceptance; never touches production. */
const allowed = process.env.WEB4_OWN_FUNCTIONAL_S3_TEST === "1";
(allowed ? describe : describe.skip)("private photo S3 POST/GET/delete real MinIO functional acceptance", () => {
  const ownerId = randomUUID();
  const postId = randomUUID();
  const uploadId = randomUUID();
  const mediaId = randomUUID();
  const incoming = `posts/${ownerId}/${postId}/incoming/${uploadId}/source.png`;
  const final = `posts/${ownerId}/${postId}/attachments/${mediaId}/full.webp`;
  const bucket = "gafus-refactor-feed-test";
  let s3: S3Client;
  let storage: ReturnType<typeof createFeedStorage>;
  beforeAll(async () => {
    if (!["/Users/asmtv1/Desktop/gafus-refactor", "/Users/asmtv1/Desktop/gafus-refactor/packages/feed-storage"].includes(process.cwd()) ||
        process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
        process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
        process.env.GAFUS_ISOLATED_S3_FEED_BUCKET !== bucket ||
        process.env.GAFUS_LOCAL_ISOLATED_API !== "1") {
      throw Error("UNSAFE_NONPROD_MINIO_TEST_TARGET");
    }
    const config = feedStorageConfigFromEnv({ ...process.env, NODE_ENV: "development" });
    expect(config).toMatchObject({ enabled: true, isolatedNonprod: true,
      bucket, endpoint: "http://127.0.0.1:9000" });
    s3 = new S3Client({ endpoint: config.endpoint, region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    storage = createFeedStorage(config);
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  });
  afterAll(async () => {
    if (!s3) return;
    for (const key of [incoming, final]) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `posts/${ownerId}/` }));
    expect(list.Contents ?? []).toHaveLength(0);
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    s3.destroy();
  });
  it("signs browser POST, verifies actual S3 bytes/metadata, private delivery and physical deletion", async () => {
    // Valid tiny PNG: no fake presign or injected S3 client.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/G9sAAAAASUVORK5CYII=", "base64");
    const signed = await storage.presignPost({ key: incoming, contentType: "image/png",
      maxBytes: 10 * 1024 * 1024, expiresAt: new Date(Date.now() + 180_000) });
    expect(new URL(signed.url).origin).toBe("http://127.0.0.1:9000");
    const form = new FormData();
    Object.entries(signed.fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", new Blob([png], { type: "image/png" }), "one.png");
    const response = await fetch(signed.url, { method: "POST", body: form, redirect: "manual" });
    expect(response.status).toBe(204);
    const metadata = await storage.head(incoming);
    expect(metadata?.bytes).toBe(png.byteLength);
    expect(metadata?.contentType).toBe("image/png");
    expect(metadata?.etag).toMatch(/^"[a-f0-9]{32}"$/i);
    const fetched = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: incoming }));
    const bytes = await fetched.Body?.transformToByteArray();
    expect(Buffer.from(bytes ?? [])).toEqual(png);
    // A worker-owned final key is separately signed for private no-store GET;
    // incoming source keys cannot be exposed as a public media URL.
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: final,
      Body: Buffer.from("RIFFwebp-private-output"), ContentType: "image/webp" }));
    const view = await storage.signCdn({ key: final,
      expiresAt: new Date(Date.now() + 180_000) });
    expect(new URL(view).origin).toBe("http://127.0.0.1:9000");
    expect(view).toContain("X-Amz-Signature=");
    const actualView = await fetch(view);
    expect(actualView.status).toBe(200);
    expect(await actualView.text()).toBe("RIFFwebp-private-output");
    await expect(storage.signCdn({ key: incoming,
      expiresAt: new Date(Date.now() + 180_000) })).rejects.toThrow();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: incoming }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: final }));
    expect(await storage.head(incoming)).toBeNull();
    const gone = await fetch(view);
    expect(gone.status).toBe(404);
  });

  it("accepts five simultaneously signed real S3 browser POSTs with isolated per-file metadata", async () => {
    const keys = Array.from({ length: 5 }, () =>
      `posts/${ownerId}/${postId}/incoming/${randomUUID()}/source.png`);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/G9sAAAAASUVORK5CYII=", "base64");
    try {
      // Five presigned browser forms are transferred in one parallel batch.
      const upload = keys.map(async key => {
        const ticket = await storage.presignPost({ key, contentType: "image/png",
          maxBytes: 10 * 1024 * 1024, expiresAt: new Date(Date.now() + 180_000) });
        const form = new FormData();
        for (const [field, value] of Object.entries(ticket.fields)) form.append(field, value);
        form.append("file", new Blob([png], { type: "image/png" }), "five.png");
        const result = await fetch(ticket.url, { method: "POST", body: form });
        expect(result.status).toBe(204);
        return key;
      });
      const completed = await Promise.all(upload);
      expect(completed).toEqual(keys);
      const metadata = await Promise.all(keys.map(key => storage.head(key)));
      expect(metadata).toHaveLength(5);
      metadata.forEach(item => {
        expect(item?.bytes).toBe(png.length);
        expect(item?.contentType).toBe("image/png");
        expect(item?.etag).toMatch(/^"[a-f0-9]{32}"$/i);
      });
    } finally {
      for (const key of keys) {
        expect(key.startsWith(`posts/${ownerId}/${postId}/incoming/`)).toBe(true);
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        expect(await storage.head(key)).toBeNull();
      }
    }
  });
});

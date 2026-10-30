import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createGalleryStorageFromEnv } from "@gafus/gallery-storage";
import { galleryStorageConfigFromEnv } from "@gafus/gallery-storage/config";
import { createGalleryS3Client, createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryImageProcessor } from "@gafus/core/services/gallery/imageProcessing";
import { sharpGalleryEngine } from "./sharp-engine";

const enabled = process.env.GALLERY_V2_REAL_S3_TEST === "isolated-only";
if (enabled && process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000")
  throw new Error("GALLERY_V2_ISOLATED_S3_ENDPOINT_REQUIRED");

(enabled ? describe : describe.skip)("Gallery V2 actual local S3 protocol", () => {
  const env = {
    NODE_ENV: "development",
    GAFUS_LOCAL_ISOLATED_API: "1",
    GAFUS_ISOLATED_NONPROD_S3: "enabled",
    GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
    GALLERY_ENABLED: "true",
  };
  const owner = randomUUID();
  const album = randomUUID();
  const upload = randomUUID();
  const photo = randomUUID();
  const source = ["albums", owner, album, "incoming", upload, "source.png"].join("/");
  const prefix = ["gallery", owner, "media", photo, "v2"].join("/");
  const thumb = prefix + "/thumb.webp";
  const full = prefix + "/full.webp";
  const owned = [source, thumb, full];
  const counts: Record<string, number> = {};
  let client: ReturnType<typeof createGalleryS3Client>;
  let objects: ReturnType<typeof createGalleryObjectStore>;
  let signer: ReturnType<typeof createGalleryStorageFromEnv>;
  beforeAll(async () => {
    const config = galleryStorageConfigFromEnv(env);
    client = createGalleryS3Client(config);
    client.middlewareStack.add((next, context) => async (args) => {
      counts[context.commandName] = (counts[context.commandName] ?? 0) + 1;
      return next(args);
    }, { step: "initialize", name: "galleryV2S3Counter" });
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
        throw error;
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    }
    objects = createGalleryObjectStore(config, client);
    signer = createGalleryStorageFromEnv(env);
  });
  afterAll(async () => {
    const errors: string[] = [];
    if (objects) for (const key of owned) {
      try {
        await objects.delete(key);
        if (await objects.head(key)) errors.push(key);
      } catch { errors.push(key); }
    }
    client?.destroy();
    expect(errors).toHaveLength(0); // fail if test-owned S3 objects remain
  });
  it("presigned private POST, one GET, two immutable WebP PUTs, duplicate/collision, signed GET and delete", async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#966e83" },
    }).png().toBuffer();
    const reservation = await signer.presignPost({
      key: source, contentType: "image/png", maxBytes: 10 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 240000),
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(reservation.fields)) form.append(name, value);
    form.append("file", new Blob([input], { type: "image/png" }), "source.png");
    const posted = await fetch(reservation.url, { method: "POST", body: form, redirect: "error" });
    expect(posted.ok).toBe(true);
    await posted.body?.cancel();
    const head = await objects.head(source);
    expect(head?.contentType).toBe("image/png");
    const measured = { get: 0, head: 0, put: 0 };
    Object.keys(counts).forEach((key) => delete counts[key]);
    const src = await objects.read(source, head!.etag);
    const variants = await createGalleryImageProcessor(sharpGalleryEngine)(src.bytes);
    const t = await objects.create(thumb, variants.thumb.bytes, "image/webp");
    const f = await objects.create(full, variants.full.bytes, "image/webp");
    measured.get = counts.GetObjectCommand ?? 0;
    measured.put = counts.PutObjectCommand ?? 0;
    measured.head = counts.HeadObjectCommand ?? 0;
    expect(measured).toEqual({ get: 1, put: 2, head: 0 });
    expect((await objects.head(thumb))?.etag).toBe(t.etag);
    expect((await objects.head(full))?.etag).toBe(f.etag);
    expect((await objects.create(thumb, variants.thumb.bytes, "image/webp")).etag).toBe(t.etag);
    const signed = await signer.signCdn({ key: thumb, expiresAt: new Date(Date.now() + 90000) });
    const signedResponse = await fetch(signed);
    expect(signedResponse.status).toBe(200);
    await signedResponse.body?.cancel();
    await objects.delete(source);
    expect(await objects.head(source)).toBeNull();
    expect(await objects.head(full)).not.toBeNull();
    await objects.delete(thumb);
    await objects.delete(full);
    expect(await objects.head(thumb)).toBeNull();
    expect(await objects.head(full)).toBeNull();
    console.log("GALLERY_V2_REAL_S3_REQUESTS=" + JSON.stringify(measured));
  }, 25000);
  it("requires private bucket denying anonymous direct GET before release", async () => {
    await objects.create(thumb, Buffer.from("private-only"), "image/webp");
    const unsigned = await fetch("http://127.0.0.1:9000/gafus-refactor-gallery-test/" + thumb);
    expect(unsigned.status).toBe(403);
    await unsigned.body?.cancel();
    await objects.delete(thumb);
  });
  it("requires actual S3 If-None-Match enforcement before enabling immutable V2 objects", async () => {
    // Local S3 emulators differ: fail, never silently accept an overwrite.
    // A provider-level 409/412 test is required for Cloud.ru acceptance.
    await objects.create(full, Buffer.from("same-first"), "image/webp");
    await expect(objects.create(full, Buffer.from("foreign-data"), "image/webp"))
      .rejects.toThrow("IMMUTABLE_CONFLICT");
    const existing = await objects.read(full);
    expect(Buffer.from(existing.bytes).toString()).toBe("same-first");
    await objects.delete(full);
  }, 10000);
});

import { describe, expect, it } from "vitest";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { galleryStorageConfigFromEnv } from "./config.js";
import { createGalleryS3Client } from "./objects.js";
import { createGalleryStorageFromEnv } from "./index.js";

const base = {
  NODE_ENV: "development",
  GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
  GALLERY_ENABLED: "true",
};

describe("explicit project-local S3 gate", () => {
  it("is default-off even when local endpoint and bucket vars are present", () => {
    expect(isolatedNonprodS3Config("gallery", {})).toBeNull();
    expect(() => isolatedNonprodS3Config("gallery", {
      ...base, GAFUS_ISOLATED_NONPROD_S3: undefined,
    })).toThrow("ISOLATED_S3_FLAG_REQUIRED");
    expect(galleryStorageConfigFromEnv({ GALLERY_ENABLED: "false" }).isolatedNonprod).toBeUndefined();
  });
  it("uses only the private local bucket and never supplies a CDN URL", async () => {
    const config = galleryStorageConfigFromEnv(base);
    expect(config).toMatchObject({ enabled: true, isolatedNonprod: true,
      bucket: "gafus-refactor-gallery-test", endpoint: "http://127.0.0.1:9000", cdnBaseUrl: "" });
    const client = createGalleryS3Client(config);
    try { expect(await client.config.region()).toBe("us-east-1");
      expect((await client.config.endpoint!()).hostname).toBe("127.0.0.1");
      expect(client.config.forcePathStyle).toBe(true);
    } finally { client.destroy(); }
    const gallery = createGalleryStorageFromEnv(base);
    const signed = new URL(await gallery.signCdn({
      key: "albums/o/a/photos/p/full.webp", expiresAt: new Date(Date.now() + 90_000),
    }));
    expect(signed.origin).toBe("http://127.0.0.1:9000");
    expect(signed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    await expect(gallery.signCdn({
      key: "albums/o/a/incoming/u/source.jpg", expiresAt: new Date(Date.now() + 90_000),
    })).rejects.toThrow("UNTRUSTED_FINAL_KEY");
    await expect(gallery.signCdn({
      key: "albums/o/a/photos/p/full.webp", expiresAt: new Date(Date.now() + 361_000),
    })).rejects.toThrow("INVALID_LOCAL_S3_EXPIRY");
  });
  it.each([
    ["opt-in typo", { GAFUS_ISOLATED_NONPROD_S3: "true" }],
    ["production", { NODE_ENV: "production" }],
    ["unguarded runtime", { GAFUS_LOCAL_ISOLATED_API: "0" }],
    ["external host", { GAFUS_ISOLATED_S3_ENDPOINT: "https://s3.cloud.ru" }],
    ["host alias", { GAFUS_ISOLATED_S3_ENDPOINT: "http://localhost:9000" }],
    ["wrong port", { GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9001" }],
    ["userinfo", { GAFUS_ISOLATED_S3_ENDPOINT: "http://user@127.0.0.1:9000" }],
    ["path", { GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000/a" }],
    ["public bucket", { GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-public" }],
    ["production bucket", { GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-documents-private" }],
    ["production keys", { CLOUDRU_S3_ACCESS_KEY_ID: "never-used" }],
    ["gallery keys", { GALLERY_S3_SECRET_ACCESS_KEY: "never-used" }],
  ])("refuses %s", (_label, changes) => {
    expect(() => galleryStorageConfigFromEnv({ ...base, ...changes })).toThrow();
  });
});

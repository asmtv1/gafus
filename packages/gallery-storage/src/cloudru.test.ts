import { describe, expect, it } from "vitest";
import { createGalleryS3Client } from "./objects";
import { galleryStorageConfigFromEnv } from "./config";

const config = {
  bucket: "gallery-private-test",
  endpoint: "https://s3.cloud.ru",
  accessKeyId: "tenant:test",
  secretAccessKey: "test",
};

describe("Cloud.ru storage configuration", () => {
  it("never enables a CDN endpoint without verified cache-hit token enforcement", () => {
    expect(() =>
      galleryStorageConfigFromEnv({
        GALLERY_ENABLED: "true",
        GALLERY_PROCESSOR_READY: "true",
        GALLERY_BUCKET: config.bucket,
        GALLERY_S3_ENDPOINT: config.endpoint,
        GALLERY_S3_ACCESS_KEY_ID: config.accessKeyId,
        GALLERY_S3_SECRET_ACCESS_KEY: config.secretAccessKey,
      }),
    ).toThrow("GALLERY_CDN_EDGE_UNVERIFIED");
  });
  it("uses the Cloud.ru signing region and private path-style endpoint", async () => {
    const client = createGalleryS3Client(config);
    try {
      expect(await client.config.region()).toBe("ru-central-1");
      expect(client.config.forcePathStyle).toBe(true);
      const endpoint = await client.config.endpoint!();
      expect(endpoint.hostname).toBe("s3.cloud.ru");
      expect(endpoint.protocol).toBe("https:");
    } finally {
      client.destroy();
    }
  });

  it.each([
    "http://s3.cloud.ru",
    "https://s3.cloud.ru.attacker.test",
    "https://s3.cloud.ru/path",
    "https://s3.cloud.ru/",
  ])("rejects an unapproved endpoint %s", (endpoint) => {
    expect(() => createGalleryS3Client({ ...config, endpoint })).toThrow(
      "UNSAFE_GALLERY_STORAGE_CONFIG",
    );
  });
});

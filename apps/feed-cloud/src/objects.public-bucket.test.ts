import { describe, expect, it } from "vitest";
import { createFeedCloudObjects } from "./objects.js";

const config = {
  FEED_S3_ENDPOINT: "https://s3.cloud.ru",
  FEED_BUCKET: "gafus-feed-private",
  FEED_S3_ACCESS_KEY_ID: "fixture-id",
  FEED_S3_SECRET_ACCESS_KEY: "fixture-secret",
};

describe("Feed Media V2 public bucket release contract", () => {
  it("accepts the explicitly public feed bucket without changing private source credentials", () => {
    const objects = createFeedCloudObjects({ ...config, FEED_BUCKET_PUBLIC: "true" });
    expect(objects.download).toBeTypeOf("function");
    expect(objects.create).toBeTypeOf("function");
    expect(objects.delete).toBeTypeOf("function");
  });

  it("also accepts the legacy unset/false feed flag", () => {
    expect(createFeedCloudObjects(config).create).toBeTypeOf("function");
    expect(createFeedCloudObjects({ ...config, FEED_BUCKET_PUBLIC: "false" }).createFile).toBeTypeOf("function");
  });

  it("retains strict gallery bucket and provider safety guards", () => {
    expect(() => createFeedCloudObjects({ ...config, FEED_BUCKET_PUBLIC: "true",
      GALLERY_BUCKET_PUBLIC: "true" })).toThrow("PUBLIC_MEDIA_BUCKET_REFUSED");
    expect(() => createFeedCloudObjects({ ...config, FEED_BUCKET_PUBLIC: "true",
      FEED_BUCKET: "gafus-media" })).toThrow("INVALID_FEED_STORAGE_CONFIG");
    expect(() => createFeedCloudObjects({ ...config, FEED_BUCKET_PUBLIC: "true",
      FEED_S3_ENDPOINT: "https://evil.example" })).toThrow("INVALID_FEED_STORAGE_ENDPOINT");
  });
});

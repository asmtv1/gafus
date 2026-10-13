import { describe, expect, it } from "vitest";
import { browserStorageUploadUrl } from "./browserStorageUploadUrl";

describe("browserStorageUploadUrl", () => {
  it.each(["https://gafus.ru", "https://www.gafus.ru"])(
    "uses the same-origin relay for Cloud.ru feed on %s",
    origin => {
      expect(browserStorageUploadUrl("https://s3.cloud.ru/gafus-feed-private/", "feed", origin))
        .toBe("/__cloudru-upload/feed");
    },
  );
  it("routes only gallery forms to the gallery bucket", () => {
    expect(browserStorageUploadUrl("https://s3.cloud.ru/gafus-gallery-private", "gallery", "https://gafus.ru"))
      .toBe("/__cloudru-upload/gallery");
  });
  it("preserves Yandex S3 and local development URLs", () => {
    expect(browserStorageUploadUrl("https://storage.yandexcloud.net/legacy", "feed", "https://gafus.ru"))
      .toBe("https://storage.yandexcloud.net/legacy");
    expect(browserStorageUploadUrl("https://s3.cloud.ru/gafus-feed-private/", "feed", "http://localhost:3002"))
      .toBe("https://s3.cloud.ru/gafus-feed-private/");
  });
  it("refuses unexpected Cloud.ru buckets, query parameters and credentials", () => {
    expect(() => browserStorageUploadUrl("https://s3.cloud.ru/gafus-gallery-private/", "feed", "https://gafus.ru")).toThrow();
    expect(() => browserStorageUploadUrl("https://s3.cloud.ru/gafus-feed-private/?x=1", "feed", "https://gafus.ru")).toThrow();
    expect(() => browserStorageUploadUrl("https://evil:s3@s3.cloud.ru/gafus-feed-private/", "feed", "https://gafus.ru")).toThrow();
    expect(() => browserStorageUploadUrl("http://s3.cloud.ru/gafus-feed-private/", "feed", "https://gafus.ru")).toThrow();
  });
});

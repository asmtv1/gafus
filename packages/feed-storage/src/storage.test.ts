import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  createFeedStorage,
  feedStorageConfigFromEnv,
  signFeedCdnUrl,
  publicFeedCdnUrl,
  type FeedStorageConfig,
} from "./storage.js";
const key = "posts/user/post/attachments/media/full.webp";
const config: FeedStorageConfig = {
  enabled: true,
  bucket: "gafus-private-test",
  endpoint: "https://s3.cloud.ru",
  accessKeyId: "test-access",
  secretAccessKey: "test-secret",
  cdnBaseUrl: "https://garaquachegasourn.begetcdn.cloud",
  cdnSecret: "a".repeat(24),
};
describe("feed storage", () => {
  it("stays disabled independently of gallery flags", () => {
    expect(
      feedStorageConfigFromEnv({ GALLERY_ENABLED: "true", GALLERY_PROCESSOR_READY: "true" })
        .enabled,
    ).toBe(false);
    expect(
      feedStorageConfigFromEnv({ FEED_ENABLED: "true", FEED_PROCESSOR_READY: "false" }).enabled,
    ).toBe(false);
  });
  it("rejects enabled incomplete and unsafe storage configuration", () => {
    expect(() =>
      feedStorageConfigFromEnv({ FEED_ENABLED: "true", FEED_PROCESSOR_READY: "true" }),
    ).toThrow();
    expect(feedStorageConfigFromEnv({ FEED_BUCKET_PUBLIC: "true" }).enabled).toBe(false);
    expect(() => createFeedStorage({ ...config, bucket: "gafus-public" })).toThrow();
    expect(() => createFeedStorage({ ...config, endpoint: "http://storage.test" })).toThrow();
  });
  it("blocks Cloud.ru CDN before cache-hit signature checks are verified", () => {
    expect(() =>
      feedStorageConfigFromEnv({
        FEED_ENABLED: "true",
        FEED_PROCESSOR_READY: "true",
        FEED_S3_ENDPOINT: "https://s3.cloud.ru",
        FEED_BUCKET: config.bucket,
        FEED_S3_ACCESS_KEY_ID: "tenant:key",
        FEED_S3_SECRET_ACCESS_KEY: "secret",
        FEED_CDN_BASE_URL: config.cdnBaseUrl,
        FEED_CDN_SECRET: config.cdnSecret,
      }),
    ).toThrow("FEED_CDN_EDGE_UNVERIFIED");
  });
  it("accepts explicit public final-read configuration only for the existing Feed bucket", () => {
    const publicConfig = feedStorageConfigFromEnv({
      FEED_ENABLED: "true", FEED_PROCESSOR_READY: "true",
      FEED_BUCKET_PUBLIC: "true", FEED_BUCKET: "gafus-feed-private",
      FEED_S3_ENDPOINT: "https://s3.cloud.ru", FEED_S3_ACCESS_KEY_ID: "tenant:key",
      FEED_S3_SECRET_ACCESS_KEY: "test-secret",
      FEED_CDN_BASE_URL: "https://new-feed.begetcdn.cloud",
      FEED_CDN_PROVIDER: "beget", FEED_INTERNAL_HMAC_SECRET: "h".repeat(32),
    });
    expect(publicConfig.publicRead).toBe(true);
    expect(publicConfig.cdnSecret).toBe("");
    expect(() => createFeedStorage({ ...publicConfig, bucket: "other-private-bucket" }))
      .toThrow("INVALID_FEED_STORAGE_CONFIG");
    expect(() => feedStorageConfigFromEnv({ FEED_BUCKET_PUBLIC: "unexpected" })).toThrow("INVALID_FEED_FLAG");
    const storage = createFeedStorage(publicConfig);
    return expect(storage.signCdn({ key, expiresAt: new Date(0) }))
      .resolves.toBe("https://new-feed.begetcdn.cloud/" + key);
  });
  it("rejects source keys, old signed-only edge, redirects, port and injected query in public URLs", () => {
    const base = "https://new-feed.begetcdn.cloud";
    expect(publicFeedCdnUrl(base, key)).toBe(`${base}/${key}`);
    for (const host of ["https://garaquachegasourn.begetcdn.cloud", "https://evil.test",
      "http://new-feed.begetcdn.cloud", "https://new-feed.begetcdn.cloud:443/",
      "https://new-feed.begetcdn.cloud/path", "https://new-feed.begetcdn.cloud?token=x"]) {
      // URL normalizes a default :443 port; test other explicit nondefault ports separately.
      if (host.endsWith(":443/")) continue;
      expect(() => publicFeedCdnUrl(host, key)).toThrow();
    }
    expect(() => publicFeedCdnUrl(base, "posts/user/post/incoming/media/source.mp4")).toThrow();
    expect(() => publicFeedCdnUrl(base, "posts/user/post/incoming/media/attempts/x/full.webp")).toThrow();
    expect(() => publicFeedCdnUrl(base, "posts/user/post/attachments/media/../incoming/source.mp4")).toThrow();
  });
  it("signs Cloud.ru uploads with its region and rejects lookalike endpoints", async () => {
    const cloud = createFeedStorage({
      ...config,
      endpoint: "https://s3.cloud.ru",
      accessKeyId: "tenant:key",
    });
    const post = await cloud.presignPost({
      key: "posts/user/post/incoming/upload/source.jpg",
      contentType: "image/jpeg",
      maxBytes: 10 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(post.url).toContain("s3.cloud.ru");
    expect(post.fields["X-Amz-Credential"]).toContain("/ru-central-1/s3/aws4_request");
    for (const endpoint of [
      "https://s3.cloud.ru.evil.test",
      "https://s3.cloud.ru/path",
      "http://s3.cloud.ru",
    ]) {
      expect(() => createFeedStorage({ ...config, endpoint })).toThrow(
        "INVALID_FEED_STORAGE_CONFIG",
      );
    }
  });
  it("signs only final objects for at most 360 seconds", () => {
    const now = 1_800_000_000_000;
    const url = new URL(
      signFeedCdnUrl(config.cdnBaseUrl, key, new Date(now + 300_000), config.cdnSecret, now),
    );
    expect(url.pathname).toMatch(/^\/md5\([A-Za-z0-9_-]{22},\d{10}\)\/posts\//);
    expect(url.search).toBe("");
    for (const delta of [0, -1000, 361_000])
      expect(() =>
        signFeedCdnUrl(config.cdnBaseUrl, key, new Date(now + delta), config.cdnSecret, now),
      ).toThrow();
    expect(() =>
      signFeedCdnUrl(
        config.cdnBaseUrl,
        "posts/user/post/incoming/upload/source.jpg",
        new Date(now + 1000),
        config.cdnSecret,
        now,
      ),
    ).toThrow();
  });
  it("generates independently verifiable Beget/CDNvideo segment and photo signatures", () => {
    const now = 1_800_000_000_000;
    const expires = Math.floor(now / 1000) + 300;
    const url = new URL(signFeedCdnUrl("https://garaquachegasourn.begetcdn.cloud", key,
      new Date(expires * 1000), config.cdnSecret, now));
    const expected = createHash("md5").update(`${config.cdnSecret}/${key}${expires}`).digest("base64url");
    expect(url.pathname).toBe(`/md5(${expected},${expires})/${key}`);
    expect(url.search).toBe("");
    expect(() => signFeedCdnUrl("https://other.begetcdn.cloud", key,
      new Date(expires * 1000), config.cdnSecret, now)).toThrow("UNSAFE_FEED_CDN");
    expect(() => signFeedCdnUrl("https://cdn.example.com", key,
      new Date(expires * 1000), config.cdnSecret, now, "beget")).toThrow("UNSAFE_FEED_CDN");
    expect(() => signFeedCdnUrl("https://garaquachegasourn.begetcdn.cloud",
      "posts/user/post/incoming/upload/source.mp4", new Date(expires * 1000), config.cdnSecret, now)).toThrow();
  });
  it.each([
    "http://cdn.example.com",
    "https://storage.yandexcloud.net",
    "https://cdn.example.com/path",
    "https://u:p@cdn.example.com",
  ])("rejects unsafe CDN %s", (base) =>
    expect(() => createFeedStorage({ ...config, cdnBaseUrl: base })).toThrow(),
  );
  it("reads multipart metadata and bounds request time", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({
        ETag: '"' + "a".repeat(32) + '-2"',
        ContentLength: 12_000_000,
        ContentType: "video/mp4",
      });
    const storage = createFeedStorage(config, { send } as never);
    expect((await storage.head("posts/user/post/incoming/upload/source.mp4"))?.bytes).toBe(
      12_000_000,
    );
    expect(send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
  });
  it("distinguishes missing objects from permission and transport errors", async () => {
    const send = vi.fn().mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    const storage = createFeedStorage(config, { send } as never);
    expect(await storage.head(key)).toBeNull();
    send.mockRejectedValue({ $metadata: { httpStatusCode: 403 } });
    await expect(storage.head(key)).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
  });
  it("rejects untrusted keys before contacting S3", async () => {
    const send = vi.fn();
    const storage = createFeedStorage(config, { send } as never);
    await expect(storage.head("albums/user/photo/full.webp")).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it.each([0, -1, 200 * 1024 * 1024 + 1, NaN])(
    "rejects invalid HEAD byte count %s",
    async (bytes) => {
      const send = vi
        .fn()
        .mockResolvedValue({
          ETag: '"' + "a".repeat(32) + '"',
          ContentLength: bytes,
          ContentType: "image/webp",
        });
      await expect(createFeedStorage(config, { send } as never).head(key)).rejects.toThrow();
    },
  );
  it("does not sign while disabled", async () => {
    const storage = createFeedStorage({ ...config, enabled: false });
    await expect(
      storage.signCdn({ key, expiresAt: new Date(Date.now() + 60_000) }),
    ).rejects.toThrow("FEED_STORAGE_DISABLED");
  });
  it("rejects MIME/extension or policy limit mismatch before signing", async () => {
    const storage = createFeedStorage(config);
    await expect(
      storage.presignPost({
        key: "posts/user/post/incoming/upload/source.jpg",
        contentType: "video/mp4",
        maxBytes: 200 * 1024 * 1024,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow("INVALID_FEED_UPLOAD_POLICY");
  });
  it.each([
    ["image/jpeg", "jpg", 10 * 1024 * 1024],
    ["video/quicktime", "mov", 200 * 1024 * 1024],
  ])("signs a constrained direct POST for %s", async (contentType, ext, maxBytes) => {
    const source = `posts/user/post/incoming/upload/source.${ext}`;
    const signed = await createFeedStorage(config).presignPost({
      key: source,
      contentType,
      maxBytes,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(signed.url).toBe("https://s3.cloud.ru/gafus-private-test");
    const policy = JSON.parse(Buffer.from(signed.fields.Policy, "base64").toString());
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ["content-length-range", 1, maxBytes],
        ["eq", "$Content-Type", contentType],
        ["eq", "$key", source],
      ]),
    );
    expect(signed.fields["Content-Type"]).toBe(contentType);
  });
});

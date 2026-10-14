import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const s3 = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = s3.send;
    destroy = s3.destroy;
  },
  PutObjectCommand: class {
    constructor(public input: object) {}
  },
  GetObjectCommand: class {
    constructor(public input: object) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));
import { uploadVetVisitFile, vetVisitFileKeys, vetVisitMediaUrl } from "../../../../cdn-upload/src/vetVisitStorage";
const bytes = Uint8Array.from([255, 216, 255, 217]);
const keys = vetVisitFileKeys("u", "p", "v", "a", "image/jpeg");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GALLERY_BUCKET", "gafus-gallery-private");
  vi.stubEnv("GALLERY_S3_ENDPOINT", "https://s3.cloud.ru");
  vi.stubEnv("GALLERY_S3_ACCESS_KEY_ID", "test:secret");
  vi.stubEnv("GALLERY_S3_SECRET_ACCESS_KEY", "test-storage-secret");
  vi.stubEnv("GALLERY_CDN_BASE_URL", "https://private-cdn.example.test");
  vi.stubEnv("GALLERY_CDN_SECRET", "a".repeat(32));
  vi.stubEnv("GALLERY_CDN_EDGE_TOKEN_VERIFIED", "true");
  s3.send.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
describe("private S3 veterinary original upload", () => {
  it("uploads immutable original only; Sharp is reserved for the worker", async () => {
    await uploadVetVisitFile(bytes, "image/jpeg", keys, { asyncPreview: true });
    expect(s3.send).toHaveBeenCalledTimes(1);
    expect(s3.send.mock.calls[0]![0].input).toMatchObject({
      Key: keys.originalKey,
      Bucket: "gafus-gallery-private",
      ContentType: "image/jpeg",
      IfNoneMatch: "*",
      CacheControl: "private, no-store",
    });
  });
  it("signs shared Gallery Beget veterinary thumbs and never exposes originals", async () => {
    vi.stubEnv("GALLERY_CDN_BASE_URL", "https://mepsuduyokabib.begetcdn.cloud");
    vi.stubEnv("GALLERY_CDN_PROVIDER", "beget");
    const url = new URL(await vetVisitMediaUrl(keys.previewKey!));
    expect(url.hostname).toBe("mepsuduyokabib.begetcdn.cloud");
    expect(url.pathname).toMatch(/^\/md5\([A-Za-z0-9_-]{22},\d{10}\)\/users\/u\/pets\/p\/vet-visits\/v\/a\/thumb\.webp$/);
    expect(url.search).toBe("");
    expect(s3.send).not.toHaveBeenCalled();
  });
  it("refuses accidental uploads to foreign or public buckets", async () => {
    vi.stubEnv("GALLERY_BUCKET", "gafus-media");
    await expect(
      uploadVetVisitFile(bytes, "image/jpeg", keys, { asyncPreview: true }),
    ).rejects.toThrow("PRIVATE_VET_STORAGE_UNAVAILABLE");
    expect(s3.send).not.toHaveBeenCalled();
  });
  it("requires verified Cloud CDN tokens even when processing asynchronously", async () => {
    vi.stubEnv("GALLERY_CDN_EDGE_TOKEN_VERIFIED", "false");
    await expect(
      uploadVetVisitFile(bytes, "image/jpeg", keys, { asyncPreview: true }),
    ).rejects.toThrow("PRIVATE_VET_CDN_EDGE_UNVERIFIED");
    expect(s3.send).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const s3 = vi.hoisted(() => ({
  send: vi.fn(),
  config: vi.fn(),
  signed: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    S3Client: class {
      constructor(config: unknown) {
        s3.config(config);
      }
      send = s3.send;
      destroy = s3.destroy;
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    DeleteObjectsCommand: class DeleteObjectsCommand extends Command {},
    ListObjectVersionsCommand: class ListObjectVersionsCommand extends Command {},
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: s3.signed }));
import {
  uploadPrivateUserMedia,
  signPrivateUserMedia,
  deletePrivateUserMedia,
} from "../../../../cdn-upload/src/privateUserMedia";
const old = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  process.env = {
    ...old,
    CLOUDRU_S3_ACCESS_KEY_ID: "tenant:key",
    CLOUDRU_S3_SECRET_ACCESS_KEY: "fake-secret",
    CLOUDRU_DOCUMENTS_BUCKET: "gafus-documents-private",
    CLOUDRU_QUESTIONS_BUCKET: "gafus-documents-private",
    CLOUDRU_DOCUMENTS_BUCKET_VERSIONING: "disabled",
    CLOUDRU_QUESTIONS_BUCKET_VERSIONING: "disabled",
  };
  s3.signed.mockResolvedValue("https://s3.cloud.ru/signed");
  s3.send.mockResolvedValue({});
});
describe("private Cloud.ru S3 operations", () => {
  it("uploads only within a dedicated private prefix with correct region and cache policy", async () => {
    const ref = await uploadPrivateUserMedia(
      "questions",
      "questions/u/id.jpg",
      new Uint8Array([1, 2, 3]),
      "image/jpeg",
    );
    expect(ref).toBe("cloudru:questions:questions/uploads/questions/u/id.jpg");
    expect(s3.config).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://s3.cloud.ru",
        region: "ru-central-1",
        forcePathStyle: true,
      }),
    );
    expect(s3.send.mock.calls[0]![0].input).toEqual(
      expect.objectContaining({
        Bucket: "gafus-documents-private",
        Key: "questions/uploads/questions/u/id.jpg",
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
        ContentLength: 3,
      }),
    );
    expect(s3.destroy).toHaveBeenCalled();
  });
  it("does not create unremovable objects before bucket versioning is confirmed", async () => {
    delete process.env.CLOUDRU_QUESTIONS_BUCKET_VERSIONING;
    await expect(
      uploadPrivateUserMedia("questions", "questions/u/id.jpg", new Uint8Array([1]), "image/jpeg"),
    ).rejects.toThrow("PRIVATE_MEDIA_VERSIONING_UNVERIFIED");
    expect(s3.send).not.toHaveBeenCalled();
  });
  it("refuses non-approved Cloud buckets even when valid storage credentials are present", async () => {
    for (const bucket of ["gafus-media", "other-tenant-public-media"]) {
      const env = { ...process.env, CLOUDRU_DOCUMENTS_BUCKET: bucket };
      await expect(
        uploadPrivateUserMedia(
          "documents",
          "users/u/pets/p/documents/id.pdf",
          new Uint8Array([1]),
          "application/pdf",
          env,
        ),
      ).rejects.toThrow("PRIVATE_MEDIA_STORAGE_UNCONFIGURED");
    }
    expect(s3.send).not.toHaveBeenCalled();
  });
  it("rejects malicious endpoint and never falls back to legacy public bucket", async () => {
    process.env.CLOUDRU_S3_ENDPOINT = "https://s3.cloud.ru.attacker.test";
    await expect(
      uploadPrivateUserMedia("questions", "questions/u/id.jpg", new Uint8Array([1]), "image/jpeg"),
    ).rejects.toThrow("PRIVATE_MEDIA_STORAGE_UNCONFIGURED");
    expect(s3.send).not.toHaveBeenCalled();
  });
  it("signs private originals for the owner without writing a temporary URL to the database", async () => {
    await expect(
      signPrivateUserMedia(
        "cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf",
        120,
        "Анализы.pdf",
      ),
    ).resolves.toBe("https://s3.cloud.ru/signed");
    const input = s3.signed.mock.calls[0]![1].input;
    expect(input.Bucket).toBe("gafus-documents-private");
    expect(input.ResponseContentDisposition).toContain("filename*=UTF-8''");
    expect(s3.signed.mock.calls[0]![2]).toEqual({ expiresIn: 120 });
  });
  it("does not delete anything while Cloud.ru bucket versioning is unverified", async () => {
    delete process.env.CLOUDRU_DOCUMENTS_BUCKET_VERSIONING;
    await expect(
      deletePrivateUserMedia("cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf"),
    ).rejects.toThrow("PRIVATE_MEDIA_VERSIONING_UNVERIFIED");
    expect(s3.send).not.toHaveBeenCalled();
  });
  it("removes historical versions and markers without touching sibling object names", async () => {
    process.env.CLOUDRU_DOCUMENTS_BUCKET_VERSIONING = "enabled";
    s3.send
      .mockReset()
      .mockResolvedValueOnce({
        Versions: [
          { Key: "documents/uploads/users/u/pets/p/documents/id.pdf", VersionId: "v1" },
          { Key: "documents/uploads/users/u/pets/p/documents/id.pdf-other", VersionId: "v2" },
        ],
        DeleteMarkers: [
          { Key: "documents/uploads/users/u/pets/p/documents/id.pdf", VersionId: "marker" },
        ],
      })
      .mockResolvedValueOnce({ Errors: [] })
      .mockResolvedValueOnce({ Versions: [], DeleteMarkers: [] })
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await deletePrivateUserMedia(
      "cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf",
    );
    expect(s3.send.mock.calls[1]![0].input.Delete.Objects).toEqual([
      { Key: "documents/uploads/users/u/pets/p/documents/id.pdf", VersionId: "v1" },
      { Key: "documents/uploads/users/u/pets/p/documents/id.pdf", VersionId: "marker" },
    ]);
  });
  it("fails deletion if Cloud.ru reports an object is still visible after DELETE", async () => {
    s3.send.mockReset().mockResolvedValue({});
    await expect(
      deletePrivateUserMedia("cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf"),
    ).rejects.toThrow("PRIVATE_MEDIA_OBJECT_REMAINS");
  });
  it("deletes a single provider-qualified object, not a same-name legacy object", async () => {
    s3.send
      .mockReset()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await deletePrivateUserMedia(
      "cloudru:documents:documents/uploads/users/u/pets/p/documents/id.pdf",
    );
    expect(s3.send.mock.calls[0]![0].input).toEqual({
      Bucket: "gafus-documents-private",
      Key: "documents/uploads/users/u/pets/p/documents/id.pdf",
    });
    expect(s3.send.mock.calls[1]![0].constructor.name).toBe("HeadObjectCommand");
    await expect(
      deletePrivateUserMedia("https://storage.yandexcloud.net/gafus-media/uploads/users/u/id.pdf"),
    ).rejects.toThrow("PRIVATE_MEDIA_INVALID_LOCATION");
  });
});

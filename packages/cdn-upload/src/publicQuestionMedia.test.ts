import { beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ send: vi.fn(), config: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Cmd {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    S3Client: class {
      constructor(config: unknown) { transport.config(config); }
      send = transport.send;
      destroy = transport.destroy;
    },
    PutObjectCommand: class PutObjectCommand extends Cmd {},
    DeleteObjectCommand: class DeleteObjectCommand extends Cmd {},
    HeadObjectCommand: class HeadObjectCommand extends Cmd {},
  };
});
import {
  QUESTION_PUBLIC_BUCKET, QUESTION_PUBLIC_CDN, publicQuestionsEnabled,
  publicQuestionLocation, parsePublicQuestionLocation,
  presentPublicQuestionPhoto, uploadPublicQuestionPhoto, deletePublicQuestionPhoto,
} from "./publicQuestionMedia";
const path = "questions/owner-id/uuid-name.jpg";
const key = "questions/uploads/questions/owner-id/uuid-name.jpg";
const marker = "cloudru:questions-public:" + key;
const configured = {
  QUESTIONS_PUBLIC_S3_ENABLED: "true",
  QUESTIONS_CDN_LIVE_VERIFIED: "true",
  QUESTIONS_CDN_BASE_URL: QUESTION_PUBLIC_CDN,
  QUESTIONS_PUBLIC_S3_BUCKET: QUESTION_PUBLIC_BUCKET,
  QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING: "disabled",
  CLOUDRU_S3_ENDPOINT: "https://s3.cloud.ru",
  CLOUDRU_S3_ACCESS_KEY_ID: "tenant:access",
  CLOUDRU_S3_SECRET_ACCESS_KEY: "test-only-secret",
};
beforeEach(() => { vi.clearAllMocks(); transport.send.mockResolvedValue({}); });
describe("isolated Questions Cloud.ru S3", () => {
  it("requires an independently verified live CDN before activating writes", () => {
    expect(publicQuestionsEnabled({})).toBe(false);
    expect(publicQuestionsEnabled({ QUESTIONS_PUBLIC_S3_ENABLED: "false" })).toBe(false);
    expect(() => publicQuestionsEnabled({ QUESTIONS_PUBLIC_S3_ENABLED: "maybe" }))
      .toThrow("QUESTION_PUBLIC_INVALID_FLAG");
    expect(() => publicQuestionsEnabled({ ...configured, QUESTIONS_CDN_LIVE_VERIFIED: "false" }))
      .toThrow("QUESTION_PUBLIC_CDN_NOT_VERIFIED");
    expect(() => publicQuestionsEnabled({ ...configured, QUESTIONS_PUBLIC_S3_BUCKET: "gafus-documents-private" }))
      .toThrow("QUESTION_PUBLIC_STORAGE_UNCONFIGURED");
    expect(publicQuestionsEnabled(configured)).toBe(true);
  });
  it("keeps the new provider marker distinct from private documents and legacy questions", () => {
    expect(publicQuestionLocation(path)).toBe(marker);
    expect(parsePublicQuestionLocation(marker)).toBe(key);
    expect(parsePublicQuestionLocation("cloudru:questions:questions/uploads/questions/u/a.jpg")).toBeNull();
    expect(parsePublicQuestionLocation("cloudru:documents:documents/uploads/users/u/file.pdf")).toBeNull();
    for (const invalid of [
      "cloudru:questions-public:questions/uploads/questions/u/../photo.jpg",
      "cloudru:questions-public:questions/uploads/questions/u/a.jpg?token=123",
      "cloudru:questions-public:documents/uploads/users/u/a.jpg",
      "cloudru:questions-public:https://evil.invalid/photo.jpg",
    ]) expect(() => parsePublicQuestionLocation(invalid)).toThrow("QUESTION_PUBLIC_INVALID_LOCATION");
  });
  it("uploads immutable photos only to the exact public Questions bucket and path", async () => {
    const data = new Uint8Array([255, 216, 255, 217]);
    expect(await uploadPublicQuestionPhoto(path, data, "image/jpeg", configured)).toBe(marker);
    expect(transport.send).toHaveBeenCalledOnce();
    const command = transport.send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.constructor.name).toBe("PutObjectCommand");
    expect(command.input).toMatchObject({
      Bucket: QUESTION_PUBLIC_BUCKET, Key: key, ContentType: "image/jpeg",
      ContentLength: data.length, IfNoneMatch: "*",
      CacheControl: "public, max-age=180, must-revalidate",
    });
    expect(transport.config).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "https://s3.cloud.ru", region: "ru-central-1", forcePathStyle: true,
    }));
    expect(transport.destroy).toHaveBeenCalledOnce();
  });
  it("never accepts wrong extensions, MIME, path traversal or disabled writes", async () => {
    await expect(uploadPublicQuestionPhoto(path, new Uint8Array([1]), "image/jpeg", {}))
      .rejects.toThrow("QUESTION_PUBLIC_DISABLED");
    await expect(uploadPublicQuestionPhoto(path, new Uint8Array([1]), "application/pdf", configured))
      .rejects.toThrow("QUESTION_PUBLIC_INVALID_FILE");
    await expect(uploadPublicQuestionPhoto("questions/owner/../file.jpg", new Uint8Array([1]), "image/jpeg", configured))
      .rejects.toThrow("QUESTION_PUBLIC_INVALID_KEY");
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("uses CDN when verified and the same public S3 origin after rollback", () => {
    expect(presentPublicQuestionPhoto(marker, configured)).toBe(QUESTION_PUBLIC_CDN + "/" + key);
    expect(presentPublicQuestionPhoto(marker, { ...configured, QUESTIONS_CDN_LIVE_VERIFIED: "false" }))
      .toBe("https://gafus-questions-public.s3.cloud.ru/" + key);
    expect(() => presentPublicQuestionPhoto("https://evil.invalid/a.jpg", configured))
      .toThrow("QUESTION_PUBLIC_INVALID_LOCATION");
  });
  it("verifies S3 erasure before allowing CDN purge intent", async () => {
    transport.send.mockResolvedValueOnce({}).mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), { $metadata: { httpStatusCode: 404 } }),
    );
    await deletePublicQuestionPhoto(marker, configured);
    expect(transport.send.mock.calls.map(([cmd]) => cmd.constructor.name))
      .toEqual(["DeleteObjectCommand", "HeadObjectCommand"]);
    expect(transport.send.mock.calls[0]![0].input).toMatchObject({
      Bucket: QUESTION_PUBLIC_BUCKET, Key: key,
    });
    transport.send.mockReset().mockResolvedValue({});
    await expect(deletePublicQuestionPhoto(marker, configured))
      .rejects.toThrow("QUESTION_PUBLIC_OBJECT_REMAINS");
    transport.send.mockClear();
    await expect(deletePublicQuestionPhoto(marker, { ...configured, QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING: "" }))
      .rejects.toThrow("QUESTION_PUBLIC_VERSIONING_UNVERIFIED");
    expect(transport.send).not.toHaveBeenCalled();
  });
});

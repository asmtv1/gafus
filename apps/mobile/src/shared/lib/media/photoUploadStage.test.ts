import { describe, expect, it, vi } from "vitest";
import {
  PhotoUploadStageError,
  photoStageDiagnostic,
  logPhotoUploadFailure,
} from "./photoUploadStage";
import { photoFailureCode, photoRetryMessage } from "./photoRetryMessage";

describe("safe mobile photo pipeline errors", () => {
  it("preserves distinct JPEG and WebP failure stages", () => {
    const jpeg = new PhotoUploadStageError("jpeg", new TypeError("cannot render bitmap"));
    const webp = new PhotoUploadStageError("webp", new Error("unknown codec failure"));
    expect(photoStageDiagnostic(jpeg)).toMatchObject({ stage: "jpeg", name: "TypeError" });
    expect(photoRetryMessage(jpeg)).toContain("открыть фото");
    expect(photoRetryMessage(webp)).toContain("WebP");
  });
  it("does not call an S3 transfer error a failed on-device encoder", () => {
    const error = new PhotoUploadStageError("transfer", new Error("S3 connection failed"));
    expect(photoFailureCode(error)).toBe("NETWORK");
    expect(photoRetryMessage(error)).toContain("интернет");
    expect(photoStageDiagnostic(error).stage).toBe("transfer");
  });
  it("redacts local photo paths and presigned URLs even in dev diagnostics", () => {
    const error = new PhotoUploadStageError(
      "reserve",
      new Error("Could not read file:///private/var/cache/IMG_0111.heic https://s3.cloud.ru/obj?X-Amz-Signature=SECRET"),
    );
    const output = JSON.stringify(photoStageDiagnostic(error));
    expect(output).not.toContain("IMG_0111");
    expect(output).not.toContain("SECRET");
    expect(output).not.toContain("s3.cloud.ru");
    expect(output).toContain("[URI]");
  });
  it("emits sanitized diagnostics only in development", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logPhotoUploadFailure("questions", new PhotoUploadStageError("webp", Error("invalid image")));
    expect(spy.mock.calls.every(call => !JSON.stringify(call).includes("file://"))).toBe(true);
    spy.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import { classifyFeedFailure } from "./failure-diagnostics.js";

describe("Feed Worker failure diagnostics", () => {
  it("classifies short S3 download failures into durable stage codes", () => {
    const result = classifyFeedFailure("video_download",
      Object.assign(new Error("sensitive signed URL must never be logged"), {
        name: "AccessDenied", $metadata: { httpStatusCode: 403 },
      }));
    expect(result).toMatchObject({
      errorCode: "VIDEO_DOWNLOAD_S3_ACCESS_DENIED",
      category: "S3_ACCESS_DENIED", httpStatus: 403,
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
  it("classifies filesystem and ffmpeg errors without stacks", () => {
    expect(classifyFeedFailure("video_tempdir", Object.assign(new Error("private path"), {
      code: "EACCES",
    })).errorCode).toBe("VIDEO_TEMPDIR_FILE_ACCESS");
    expect(classifyFeedFailure("video_process", new Error("VIDEO_TOO_LONG")).errorCode)
      .toBe("VIDEO_PROCESS_VIDEO_TOO_LONG");
    expect(classifyFeedFailure("video_download", Object.assign(new Error("bad"), {
      code: "ETIMEDOUT",
    })).errorCode).toBe("VIDEO_DOWNLOAD_NETWORK_TIMEOUT");
  });
  it("never leaks unrecognized provider error messages or large codes", () => {
    const result = classifyFeedFailure("video_download", Object.assign(
      new Error("private Secret=EXAMPLE_TOKEN"), { code: "PASSWORD_LEAKED" },
    ));
    expect(result.errorCode).toBe("VIDEO_DOWNLOAD_UNKNOWN");
    expect(JSON.stringify(result)).not.toContain("EXAMPLE_TOKEN");
    expect(result.errorCode.length).toBeLessThanOrEqual(64);
    expect(result.errorCode).toMatch(/^[A-Z][A-Z0-9_]{0,63}$/);
    expect(classifyFeedFailure("video_download", { name: "toString" }).errorCode)
      .toBe("VIDEO_DOWNLOAD_UNKNOWN");
  });
  it("distinguishes HTTP failures and aborts", () => {
    expect(classifyFeedFailure("video_download", {
      name: "S3ServiceException", $metadata: { httpStatusCode: 503 },
    }).errorCode).toBe("VIDEO_DOWNLOAD_HTTP_503");
    expect(classifyFeedFailure("video_process", { name: "AbortError" }).errorCode)
      .toBe("VIDEO_PROCESS_ABORTED");
  });
});

import { describe, it, expect } from "vitest";
import { photoRetryMessage, photoFailureCode } from "./photoRetryMessage";
describe("safe phone photo recovery advice", () => {
  it("encourages one-file retry after device encode failure", () => {
    expect(photoRetryMessage(Error("image manipulator failed"))).toContain("телефоне");
    expect(photoRetryMessage(Error("S3 connection lost"))).toContain("интернет");
    expect(photoRetryMessage(Error("unknown X-Amz-Signature=SECRET"))).not.toContain("SECRET");
  });
  it("distinguishes stale Android picker photo and native module mismatch", () => {
    expect(photoFailureCode(new Error("ENOENT: /private/app/cache/source.jpg"))).toBe("SOURCE_MISSING");
    expect(photoRetryMessage(new Error("ENOENT file missing"))).toContain("Выберите его заново");
    expect(photoFailureCode(new Error("Cannot find native module 'ExpoImageManipulator'"))).toBe("NATIVE_MISSING");
    expect(photoRetryMessage(new Error("Cannot find native module 'ExpoImageManipulator'"))).toContain("магазин приложений");
  });
  it("categorizes Android memory failures without leaking diagnostics", () => {
    expect(photoFailureCode(new Error("android.graphics.OutOfMemoryError Bitmap allocation"))).toBe("MEMORY");
    expect(photoRetryMessage(new Error("android.graphics.OutOfMemoryError"))).toContain("памяти");
    expect(photoFailureCode(new Error("signed https://bucket.private/foo?X-Amz-Signature=secret"))).toBe("UNKNOWN");
  });
});

import { describe, expect, it } from "vitest";

import { validateImageUpload, validateVideoUpload } from "./file-validation";

const mockFile = (type: string, sizeBytes: number) =>
  ({ type, size: sizeBytes } as unknown as File);

const MB = 1024 * 1024;

describe("validateImageUpload", () => {
  it("accepts image/jpeg 5MB", () => {
    const result = validateImageUpload(mockFile("image/jpeg", 5 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("accepts image/png at exactly 10MB", () => {
    const result = validateImageUpload(mockFile("image/png", 10 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("rejects image/png over 10MB", () => {
    const result = validateImageUpload(mockFile("image/png", 10 * MB + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("10MB");
  });

  it("accepts image/webp", () => {
    const result = validateImageUpload(mockFile("image/webp", 1 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("rejects application/pdf with allowed types message", () => {
    const result = validateImageUpload(mockFile("application/pdf", 1 * MB));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/JPEG|PNG|WebP/i);
  });

  it("accepts image/jpeg size 0", () => {
    const result = validateImageUpload(mockFile("image/jpeg", 0));
    expect(result).toEqual({ valid: true });
  });

  it("accepts image/jpg", () => {
    const result = validateImageUpload(mockFile("image/jpg", 1 * MB));
    expect(result).toEqual({ valid: true });
  });
});

describe("validateVideoUpload", () => {
  it("accepts video/mp4 50MB", () => {
    const result = validateVideoUpload(mockFile("video/mp4", 50 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("accepts video/quicktime", () => {
    const result = validateVideoUpload(mockFile("video/quicktime", 10 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("accepts video/x-msvideo", () => {
    const result = validateVideoUpload(mockFile("video/x-msvideo", 10 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("accepts video/mp4 at exactly 100MB", () => {
    const result = validateVideoUpload(mockFile("video/mp4", 100 * MB));
    expect(result).toEqual({ valid: true });
  });

  it("rejects video/mp4 over 100MB", () => {
    const result = validateVideoUpload(mockFile("video/mp4", 100 * MB + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("100MB");
  });

  it("rejects image/jpeg as video", () => {
    const result = validateVideoUpload(mockFile("image/jpeg", 10 * MB));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/MP4|MOV|AVI/i);
  });
});

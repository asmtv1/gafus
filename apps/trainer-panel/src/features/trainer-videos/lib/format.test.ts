import { describe, expect, it } from "vitest";

import { formatFileSize } from "./format";

describe("trainer video formatting", () => {
  it("formats invalid and empty file sizes as zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 Б");
    expect(formatFileSize(Number.NaN)).toBe("0 Б");
  });

  it("formats byte, kilobyte, and megabyte sizes", () => {
    expect(formatFileSize(512)).toBe("512 Б");
    expect(formatFileSize(1536)).toBe("1.5 КБ");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 МБ");
  });
});

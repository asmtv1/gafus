import { describe, expect, it } from "vitest";
import { getFeedUploadedFilesPercent } from "./feed";

describe("saved feed upload progress", () => {
  it("shows a percentage only for files whose uploads the server acknowledged", () => {
    expect(getFeedUploadedFilesPercent([{ status: "ready" }])).toBe(100);
    expect(getFeedUploadedFilesPercent([{ status: "processing" }, { status: "reserved" }])).toBe(50);
    expect(getFeedUploadedFilesPercent([{ status: "uploaded" }, { status: "ready" }])).toBe(100);
    expect(getFeedUploadedFilesPercent([{ status: "reserved" }])).toBe(0);
  });
  it("does not invent progress for no media, errors or absent status", () => {
    expect(getFeedUploadedFilesPercent([])).toBeNull();
    expect(getFeedUploadedFilesPercent([{ status: "failed" }])).toBeNull();
    expect(getFeedUploadedFilesPercent([{ status: undefined }])).toBeNull();
    expect(getFeedUploadedFilesPercent([{ status: "expired" }])).toBeNull();
  });
});

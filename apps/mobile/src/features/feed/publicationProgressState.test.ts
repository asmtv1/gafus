import { describe, expect, it } from "vitest";
import { getFeedPublicationPercent } from "./publicationProgressState";

describe("publication progress state", () => {
  it("uses actual reported upload progress", () => {
    expect(getFeedPublicationPercent("uploading", 36)).toBe(36);
    expect(getFeedPublicationPercent("uploading", 0)).toBe(0);
    expect(getFeedPublicationPercent("uploading", 100)).toBe(100);
  });

  it("never invents progress while awaiting upload data or server processing", () => {
    expect(getFeedPublicationPercent("uploading", null)).toBeNull();
    expect(getFeedPublicationPercent("processing", 100)).toBeNull();
    expect(getFeedPublicationPercent("processing", null)).toBeNull();
  });

  it("bounds malformed percentages and falls back to indeterminate mode for invalid data", () => {
    expect(getFeedPublicationPercent("uploading", 150)).toBe(100);
    expect(getFeedPublicationPercent("uploading", -20)).toBe(0);
    expect(getFeedPublicationPercent("uploading", Number.NaN)).toBeNull();
    expect(getFeedPublicationPercent("uploading", Infinity)).toBeNull();
  });
});

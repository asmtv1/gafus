import { describe, expect, it } from "vitest";
import { normalizeVersionPreview } from "./VersionPublicationForm";

const base = { total: 1, verified: 1, token: "valid-token", active: null };

describe("OTA version publication response", () => {
  it("handles a response without an update list without crashing", () => {
    expect(normalizeVersionPreview(base).choices).toEqual([]);
  });

  it("does not trust a non-array update list", () => {
    expect(normalizeVersionPreview({ ...base, choices: null }).choices).toEqual([]);
    expect(normalizeVersionPreview({ ...base, choices: {} }).choices).toEqual([]);
  });

  it("preserves a valid list", () => {
    const choices = [{ key: "one" }];
    expect(normalizeVersionPreview({ ...base, choices }).choices).toBe(choices);
  });

  it("blocks actions when required registry metadata is missing", () => {
    expect(() => normalizeVersionPreview(null)).toThrow();
    expect(() => normalizeVersionPreview({ choices: [] })).toThrow();
    expect(() => normalizeVersionPreview({ ...base, token: "" })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { verifySmartExposure } from "./smart-exposure";

const snapshot = {
  actorId: "actor-a", version: "smart-rule-2026-10-a",
  preferencesUpdatedAt: 123,
  rows: [{ id: "post-1", exposureToken: "random-server-token-1" }],
};
const claim = {
  postId: "post-1", rank: 0,
  algorithmVersion: "smart-rule-2026-10-a",
  exposureToken: "random-server-token-1",
};
describe("opaque feed exposure validation", () => {
  it("requires verified owner, rank, algorithm, preference version, and token", () => {
    expect(verifySmartExposure(snapshot, "actor-a", 123, claim)).toBe(true);
    expect(verifySmartExposure(snapshot, "actor-b", 123, claim)).toBe(false);
    expect(verifySmartExposure(snapshot, "actor-a", 124, claim)).toBe(false);
    expect(verifySmartExposure(snapshot, "actor-a", 123, { ...claim, rank: 1 })).toBe(false);
    expect(verifySmartExposure(snapshot, "actor-a", 123, { ...claim, postId: "post-2" })).toBe(false);
    expect(verifySmartExposure(snapshot, "actor-a", 123, { ...claim, exposureToken: "forged" })).toBe(false);
    expect(verifySmartExposure(snapshot, "actor-a", 123, { ...claim, algorithmVersion: "other" })).toBe(false);
  });
  it("permits legacy qualified impressions only when explicit compatibility is enabled", () => {
    expect(verifySmartExposure(snapshot, "actor-a", 123, { ...claim, exposureToken: undefined })).toBe(false);
    expect(verifySmartExposure(snapshot, "actor-a", 123, { ...claim, exposureToken: undefined }, false)).toBe(true);
  });
});

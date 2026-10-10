import { describe, expect, it, vi } from "vitest";
import { getSmartFeedHealth } from "./smart-health";
import type { FeedDb } from "./ports";

describe("smart feed privacy-safe health counters", () => {
  it("reports aggregate signals without emitting user data", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{
      exposedUsers: 12, qualifiedImpressions: 130,
      distinctPosts: 18, distinctAuthors: 3,
      postOpens: 0, longDwells: 0, notInterested: 4,
      maxAuthorImpressions: 90,
    }]) } as unknown as FeedDb;
    const value = await getSmartFeedHealth(db);
    expect(value.authorConcentrationWarning).toBe(true);
    expect(value.outcomeCaptureWarning).toBe(true);
    expect(JSON.stringify(value)).not.toContain("userId");
  });
  it("does not trigger low-volume false alerts", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as FeedDb;
    const value = await getSmartFeedHealth(db);
    expect(value.exposureRateWarning).toBe(false);
    expect(value.authorConcentrationWarning).toBe(false);
    expect(value.outcomeCaptureWarning).toBe(false);
  });
});

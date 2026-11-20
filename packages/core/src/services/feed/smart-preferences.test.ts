import { describe, expect, it, vi } from "vitest";
import type { SmartFeedPreferencesPort } from "./smart-preferences";
import { createSmartFeedPreferences, smartFeedbackSchema, smartImpressionsSchema, smartRankingEventsSchema, smartPreferenceSchema } from "./smart-preferences";

describe("smart personalization HTTP contracts", () => {
  it("accepts only supported post feedback", () => {
    expect(smartFeedbackSchema.parse({ kind: "not_interested" })).toEqual({ kind: "not_interested" });
    expect(smartFeedbackSchema.safeParse({ kind: "hide_all" }).success).toBe(false);
  });
  it("validates every preference and rejects unknown keys", () => {
    expect(smartPreferenceSchema.parse({ useCity: false })).toEqual({ useCity: false });
    expect(smartPreferenceSchema.safeParse({}).success).toBe(false);
    expect(smartPreferenceSchema.safeParse({ useLocation: true }).success).toBe(false);
    expect(smartPreferenceSchema.safeParse({ useBehavior: "yes" }).success).toBe(false);
  });
  it("limits qualified impression batches", () => {
    const valid = {
      eventId: "123e4567-e89b-42d3-a456-426614174000",
      postId: "post_1",
      rankingSessionId: "123e4567-e89b-42d3-a456-426614174001",
      algorithmVersion: "smart-rule-2026-10-a",
      rank: 4, visibleMs: 2_000,
    };
    expect(smartImpressionsSchema.safeParse({ events: [valid] }).success).toBe(true);
    expect(smartImpressionsSchema.safeParse({ events: [] }).success).toBe(false);
    expect(smartImpressionsSchema.safeParse({ events: Array(51).fill(valid) }).success).toBe(false);
    expect(smartImpressionsSchema.safeParse({ events: [{ ...valid, rank: -1 }] }).success).toBe(false);
    expect(smartImpressionsSchema.safeParse({ events: [{ ...valid, visibleMs: 999 }] }).success).toBe(false);
    expect(smartImpressionsSchema.safeParse({ events: [{ ...valid, visibleMs: 60_001 }] }).success).toBe(false);
  });
  it("requires server-issued exposure tokens for tracked outcomes and bounds active dwell", () => {
    const valid = {
      eventId: "123e4567-e89b-42d3-a456-426614174000",
      postId: "post_1", rankingSessionId: "123e4567-e89b-42d3-a456-426614174001",
      algorithmVersion: "smart-rule-2026-10-a", rank: 0,
      exposureToken: "123e4567-e89b-42d3-a456-426614174002",
      kind: "dwell", durationMs: 120000,
    };
    expect(smartRankingEventsSchema.safeParse({ events: [valid] }).success).toBe(true);
    expect(smartRankingEventsSchema.safeParse({ events: [{ ...valid, exposureToken: undefined }] }).success).toBe(false);
    expect(smartRankingEventsSchema.safeParse({ events: [{ ...valid, durationMs: 120001 }] }).success).toBe(false);
    expect(smartRankingEventsSchema.safeParse({ events: [{ ...valid, kind: "fake_like" }] }).success).toBe(false);
    expect(smartRankingEventsSchema.safeParse({ events: Array(31).fill(valid) }).success).toBe(false);
  });
  it("always derives preference owner from the authenticated actor", async () => {
    const patch = vi.fn().mockImplementation(async (_actor, update, defaults) => ({ ...defaults,...update }));
    const read = vi.fn().mockResolvedValue(null);
    const port = { actorExists:vi.fn().mockResolvedValue(true),read,patch,
      resetDerived:vi.fn() } as unknown as SmartFeedPreferencesPort;
    const prefs=createSmartFeedPreferences(port);
    expect(await prefs.get("viewer_1")).toMatchObject({enabled:true,useCity:true});
    expect(await prefs.patch("viewer_1",{useCity:false})).toMatchObject({useCity:false});
    expect(patch).toHaveBeenCalledWith("viewer_1",{useCity:false},expect.objectContaining({useCity:true}));
    await expect(prefs.patch("viewer_1",{userId:"other"})).rejects.toMatchObject({status:400});
  });
  it("requires a known actor",async()=>{
    const port={actorExists:vi.fn().mockResolvedValue(false)} as unknown as SmartFeedPreferencesPort;
    await expect(createSmartFeedPreferences(port).get("invalid")).rejects.toMatchObject({status:401});
  });
  it("reset asks the SQL adapter to remove only derived data in one transaction",async()=>{
    const resetDerived=vi.fn().mockResolvedValue(undefined);
    const port={actorExists:vi.fn().mockResolvedValue(true),resetDerived} as unknown as SmartFeedPreferencesPort;
    expect((await createSmartFeedPreferences(port).reset("viewer_1")).reset).toBe(true);
    expect(resetDerived).toHaveBeenCalledExactlyOnceWith("viewer_1",expect.any(Date),expect.objectContaining({enabled:true}));
  });
});

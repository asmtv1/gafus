import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
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
  it("always derives the preference owner from the actor, not the body", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "viewer_1" });
    const upsert = vi.fn().mockResolvedValue({
      enabled: true, useCity: false, usePets: true, useBehavior: true, exploration: true,
    });
    const db = { user: { findUnique }, feedPersonalizationPreference: {
      findUnique: vi.fn().mockResolvedValue(null), upsert,
    } } as unknown as FeedDb;
    const prefs = createSmartFeedPreferences(db);
    expect(await prefs.get("viewer_1")).toMatchObject({ enabled: true, useCity: true });
    expect(await prefs.patch("viewer_1", { useCity: false })).toMatchObject({ useCity: false });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "viewer_1" },
      create: expect.objectContaining({ userId: "viewer_1", useCity: false }),
    }));
    await expect(prefs.patch("viewer_1", { userId: "other" })).rejects.toMatchObject({ status: 400 });
  });
  it("requires a known actor", async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as FeedDb;
    await expect(createSmartFeedPreferences(db).get("invalid")).rejects.toMatchObject({ status: 401 });
  });
  it("reset clears derived data without deleting user content", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const affinityDelete = vi.fn().mockResolvedValue({ count: 2 });
    const impressionsDelete = vi.fn().mockResolvedValue({ count: 5 });
    const rankingDelete = vi.fn().mockResolvedValue({ count: 5 });
    const feedbackDelete = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      feedPersonalizationPreference: { upsert },
      feedUserAuthorAffinity: { deleteMany: affinityDelete },
      feedImpression: { deleteMany: impressionsDelete },
      feedRankingEvent: { deleteMany: rankingDelete },
      feedUserPostFeedback: { deleteMany: feedbackDelete },
    };
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "viewer_1" }) },
      $transaction: vi.fn().mockImplementation(fn => fn(tx)),
    } as unknown as FeedDb;
    expect((await createSmartFeedPreferences(db).reset("viewer_1")).reset).toBe(true);
    expect(affinityDelete).toHaveBeenCalledWith({ where: { userId: "viewer_1" } });
    expect(impressionsDelete).toHaveBeenCalledWith({ where: { userId: "viewer_1" } });
    expect(rankingDelete).toHaveBeenCalledWith({ where: { userId: "viewer_1" } });
    expect(feedbackDelete).toHaveBeenCalledWith({ where: { userId: "viewer_1" } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "viewer_1" },
      update: expect.objectContaining({ historyResetAt: expect.any(Date) }),
    }));
  });
});

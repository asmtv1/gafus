import { describe, expect, it, vi } from "vitest";
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
import { summarizeRewardedAdsSessions, type RewardedAdsSessionInput } from "./adminRewardedAdsService";

function item(id: string, userId: string, events: string[], rewarded = false): RewardedAdsSessionInput {
  const createdAt = new Date("2026-11-19T12:00:00.000Z");
  return {
    id, userId, platform: "ANDROID", targetType: null, targetId: null,
    createdAt, rewardedAt: rewarded ? createdAt : null, grantedAt: null,
    errorCode: null, events: events.map(eventType => ({
      eventType, payload: {}, createdAt,
    })),
  };
}
describe("rewarded ads dashboard deterministic counters", () => {
  it("returns a zero-denominator summary for an empty selection", () => {
    const totals = summarizeRewardedAdsSessions([]);
    expect(totals.sessions).toBe(0);
    expect(totals.uniqueUsers).toBe(0);
    expect(totals.showRate).toBe(0);
    expect(totals.completionRate).toBe(0);
  });
  it("counts unique people separately from sessions and handles skipped ads", () => {
    const totals = summarizeRewardedAdsSessions([
      item("one", "same-user", ["LOADED", "SHOWN", "REWARDED"], true),
      item("two", "same-user", ["LOADED", "SHOWN", "DISMISSED"]),
    ]);
    expect(totals).toMatchObject({
      sessions: 2, uniqueUsers: 1, loaded: 2, shown: 2, rewarded: 1,
      skipped: 1, uniqueShownUsers: 1, uniqueSkippedUsers: 1,
      completionRate: 50, skipRate: 50,
    });
  });
  it("excludes out-of-range session events on the half-open end boundary", () => {
    const now = new Date("2026-11-19T12:00:00.000Z");
    const totals = summarizeRewardedAdsSessions(
      [item("one", "same-user", ["LOADED", "SHOWN", "REWARDED"], true)],
      { start: new Date("2026-11-19T11:00:00.000Z"), end: now },
    );
    expect(totals.sessions).toBe(0);
    expect(totals.shown).toBe(0);
    expect(totals.rewarded).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRewardedAdsAdminDashboard,
  summarizeRewardedAdsSessions,
  type RewardedAdsSessionInput,
} from "./adminRewardedAdsService";

const rewardedAdSessionFindMany = vi.fn();
const rewardedAdSettingsFindUnique = vi.fn();
const stepOnDayFindMany = vi.fn();
const articleFindMany = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    rewardedAdSession: { findMany: (...args: unknown[]) => rewardedAdSessionFindMany(...args) },
    rewardedAdSettings: {
      findUnique: (...args: unknown[]) => rewardedAdSettingsFindUnique(...args),
    },
    stepOnDay: { findMany: (...args: unknown[]) => stepOnDayFindMany(...args) },
    article: { findMany: (...args: unknown[]) => articleFindMany(...args) },
  },
}));

function session(
  overrides: Partial<RewardedAdsSessionInput> & Pick<RewardedAdsSessionInput, "id" | "userId">,
): RewardedAdsSessionInput {
  return {
    platform: "ANDROID",
    targetType: "COURSE_STEP",
    targetId: "step-link-1",
    createdAt: new Date("2026-05-17T09:00:00.000Z"),
    rewardedAt: null,
    grantedAt: null,
    errorCode: null,
    events: [],
    ...overrides,
  };
}

function event(eventType: string, createdAt = "2026-05-17T09:01:00.000Z", payload?: unknown) {
  return { eventType, createdAt: new Date(createdAt), payload: payload ?? null };
}

describe("rewarded ads admin dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewardedAdSessionFindMany.mockResolvedValue([]);
    rewardedAdSettingsFindUnique.mockResolvedValue({
      androidEnabled: true,
      iosEnabled: false,
      testMode: false,
    });
    stepOnDayFindMany.mockResolvedValue([]);
    articleFindMany.mockResolvedValue([]);
  });

  it("counts distinct sessions and users without inflating duplicate lifecycle events", () => {
    const first = session({
      id: "session-1",
      userId: "user-1",
      rewardedAt: new Date("2026-05-17T09:05:00.000Z"),
      grantedAt: new Date("2026-05-17T09:06:00.000Z"),
      events: [
        event("LOADED"),
        event("SHOWN"),
        event("SHOWN"),
        event("REWARDED"),
        event("DISMISSED"),
      ],
    });
    const second = session({
      id: "session-2",
      userId: "user-1",
      events: [event("LOADED"), event("SHOWN"), event("DISMISSED")],
    });

    expect(summarizeRewardedAdsSessions([first, second])).toMatchObject({
      sessions: 2,
      uniqueUsers: 1,
      loaded: 2,
      shown: 2,
      rewarded: 1,
      granted: 1,
      skipped: 1,
      uniqueShownUsers: 1,
      uniqueRewardedUsers: 1,
      uniqueSkippedUsers: 1,
      completionRate: 50,
      skipRate: 50,
    });
  });

  it("does not count rewarded-then-dismissed sessions as skipped", () => {
    const completed = session({
      id: "session-1",
      userId: "user-1",
      rewardedAt: new Date("2026-05-17T09:05:00.000Z"),
      events: [event("SHOWN"), event("REWARDED"), event("DISMISSED")],
    });

    expect(summarizeRewardedAdsSessions([completed])).toMatchObject({
      shown: 1,
      rewarded: 1,
      skipped: 0,
      completionRate: 100,
    });
  });

  it("keeps the cohort funnel monotonic when an earlier client event is missing", () => {
    const granted = session({
      id: "session-granted",
      userId: "user-1",
      grantedAt: new Date("2026-05-17T09:06:00.000Z"),
      events: [],
    });

    expect(summarizeRewardedAdsSessions([granted])).toMatchObject({
      sessions: 1,
      loaded: 1,
      shown: 1,
      rewarded: 1,
      granted: 1,
      loadRate: 100,
      showRate: 100,
      completionRate: 100,
      grantRate: 100,
    });
  });

  it("returns finite zero rates for an empty cohort", () => {
    const summary = summarizeRewardedAdsSessions([]);

    expect(summary).toMatchObject({
      loadRate: 0,
      showRate: 0,
      completionRate: 0,
      grantRate: 0,
      skipRate: 0,
      errorRate: 0,
    });
    expect(Object.values(summary).every(Number.isFinite)).toBe(true);
  });

  it("includes the lower event boundary and excludes the upper boundary", () => {
    const boundarySession = session({
      id: "session-boundary",
      userId: "user-1",
      createdAt: new Date("2026-05-16T21:00:00.000Z"),
      rewardedAt: new Date("2026-05-17T21:00:00.000Z"),
      events: [
        event("SHOWN", "2026-05-16T21:00:00.000Z"),
        event("FAILED", "2026-05-17T20:59:59.999Z"),
        event("REWARDED", "2026-05-17T21:00:00.000Z"),
      ],
    });

    expect(
      summarizeRewardedAdsSessions([boundarySession], {
        start: new Date("2026-05-16T21:00:00.000Z"),
        end: new Date("2026-05-17T21:00:00.000Z"),
      }),
    ).toMatchObject({
      sessions: 1,
      shown: 1,
      rewarded: 0,
      failed: 1,
    });
  });

  it("uses Moscow calendar boundaries and event time for today's users", async () => {
    const touched = session({
      id: "session-yesterday",
      userId: "user-1",
      createdAt: new Date("2026-05-16T20:30:00.000Z"),
      rewardedAt: new Date("2026-05-16T21:05:00.000Z"),
      events: [
        event("SHOWN", "2026-05-16T21:04:00.000Z"),
        event("REWARDED", "2026-05-16T21:05:00.000Z"),
      ],
    });
    rewardedAdSessionFindMany.mockImplementation((args: { where: { OR?: unknown[] } }) =>
      Promise.resolve(args.where.OR ? [touched] : []),
    );

    const dashboard = await getRewardedAdsAdminDashboard({
      days: 7,
      now: new Date("2026-05-17T12:00:00.000Z"),
    });

    const cohortCall = rewardedAdSessionFindMany.mock.calls[0]?.[0];
    expect(cohortCall.where.createdAt).toEqual({
      gte: new Date("2026-05-10T21:00:00.000Z"),
      lt: new Date("2026-05-17T21:00:00.000Z"),
    });
    expect(dashboard.today).toMatchObject({
      sessionsStarted: 0,
      shown: 1,
      rewarded: 1,
      uniqueShownUsers: 1,
      uniqueRewardedUsers: 1,
    });
  });

  it("groups target performance and exposes the real client failure code", async () => {
    const failed = session({
      id: "session-1",
      userId: "user-1",
      events: [event("LOADED"), event("FAILED", "2026-05-17T09:02:00.000Z", { code: "NO_FILL" })],
    });
    rewardedAdSessionFindMany.mockImplementation((args: { where: { OR?: unknown[] } }) =>
      Promise.resolve(args.where.OR ? [] : [failed]),
    );
    stepOnDayFindMany.mockResolvedValue([
      {
        id: "step-link-1",
        order: 2,
        step: { title: "Выдержка" },
        day: {
          title: "Спокойствие",
          dayLinks: [{ order: 0, course: { name: "Базовый курс" } }],
        },
      },
    ]);

    const dashboard = await getRewardedAdsAdminDashboard({
      days: 7,
      now: new Date("2026-05-17T12:00:00.000Z"),
    });

    expect(dashboard.byTarget[0]).toMatchObject({
      targetId: "step-link-1",
      title: "Выдержка",
      context: "Базовый курс: день 1 · шаг 3",
      sessions: 1,
      failed: 1,
    });
    expect(dashboard.failures).toEqual([{ code: "NO_FILL", count: 1 }]);
  });
});

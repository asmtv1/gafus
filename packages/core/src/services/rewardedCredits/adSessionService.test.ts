import { beforeEach, describe, expect, it, vi } from "vitest";

import { RewardedAdSessionError, RewardedDailyLimitReachedError } from "./errors";

type Session = {
  id: string;
  userId: string;
  platform: "ANDROID" | "IOS";
  provider: "YANDEX";
  placementId: string;
  status: string;
  targetType: "ARTICLE" | "COURSE_STEP" | null;
  targetId: string | null;
  requestNonceHash: string;
  expiresAt: Date;
  rewardedAt: Date | null;
  grantedAt: Date | null;
  createdAt: Date;
};
type Access = {
  id: string;
  userId: string;
  targetType: "ARTICLE" | "COURSE_STEP";
  targetId: string;
  source: "REWARDED_AD" | "LEGACY_GAFUS";
  platform: "ANDROID" | "IOS" | null;
  sessionId: string | null;
  grantedAt: Date;
  expiresAt: Date;
};

const state = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  accesses: new Map<string, Access>(),
  events: [] as { sessionId: string; eventType: string; payload?: unknown }[],
  dailyAdLimit: 1,
  platformEnabled: true,
}));

const prismaMocks = vi.hoisted(() => {
  let transactionTail = Promise.resolve();
  const rewardedAdSession = {
    findFirst: vi.fn(({ where }) =>
      Promise.resolve(
        [...state.sessions.values()].find(
          (session) =>
            session.userId === where.userId &&
            session.platform === where.platform &&
            where.status.in.includes(session.status) &&
            session.expiresAt > where.expiresAt.gt &&
            session.targetType === where.targetType &&
            session.targetId === where.targetId,
        ) ?? null,
      ),
    ),
    findUnique: vi.fn(({ where }) => Promise.resolve(state.sessions.get(where.id) ?? null)),
    count: vi.fn(({ where }) =>
      Promise.resolve(
        [...state.sessions.values()].filter(
          (session) =>
            session.userId === where.userId &&
            session.rewardedAt !== null &&
            session.rewardedAt >= where.rewardedAt.gte &&
            session.rewardedAt < where.rewardedAt.lt,
        ).length,
      ),
    ),
    create: vi.fn(({ data }) => {
      const session: Session = {
        id: `session-${state.sessions.size + 1}`,
        provider: "YANDEX",
        status: "CREATED",
        rewardedAt: null,
        grantedAt: null,
        createdAt: new Date("2026-08-05T10:00:00.000Z"),
        ...data,
      };
      state.sessions.set(session.id, session);
      return Promise.resolve(session);
    }),
    update: vi.fn(({ where, data }) => {
      const session = state.sessions.get(where.id);
      if (!session) throw new Error("missing session");
      Object.assign(session, data);
      return Promise.resolve(session);
    }),
    updateMany: vi.fn(({ where, data }) => {
      const session = state.sessions.get(where.id);
      if (
        !session ||
        session.status !== where.status ||
        (where.rewardedAt === null && session.rewardedAt !== null)
      ) {
        return Promise.resolve({ count: 0 });
      }
      Object.assign(session, data);
      return Promise.resolve({ count: 1 });
    }),
  };
  const rewardedTargetAccess = {
    findFirst: vi.fn(({ where }) =>
      Promise.resolve(
        [...state.accesses.values()]
          .filter(
            (access) =>
              access.userId === where.userId &&
              access.targetType === where.targetType &&
              access.targetId === where.targetId &&
              access.expiresAt > where.expiresAt.gt,
          )
          .sort((left, right) => right.expiresAt.getTime() - left.expiresAt.getTime())[0] ?? null,
      ),
    ),
    findUnique: vi.fn(({ where }) =>
      Promise.resolve(
        [...state.accesses.values()].find((access) => access.sessionId === where.sessionId) ?? null,
      ),
    ),
    create: vi.fn(({ data }) => {
      const access: Access = { id: `access-${state.accesses.size + 1}`, ...data };
      state.accesses.set(access.id, access);
      return Promise.resolve(access);
    }),
  };
  const client = {
    rewardedAdSession,
    rewardedTargetAccess,
    rewardedAdEvent: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          state.events.find(
            (event) =>
              event.sessionId === where.sessionId && event.eventType === where.eventType,
          )
            ? { id: "matching-event" }
            : null,
        ),
      ),
      create: vi.fn(({ data }) => {
        state.events.push(data);
        return Promise.resolve({ id: `event-${state.events.length}`, ...data });
      }),
    },
    rewardedAdSettings: {
      findUnique: vi.fn().mockImplementation(() =>
        Promise.resolve({ dailyAdLimit: state.dailyAdLimit }),
      ),
    },
    article: { findFirst: vi.fn().mockResolvedValue({ id: "article-1" }) },
    stepOnDay: { findFirst: vi.fn().mockResolvedValue({ id: "step-1" }) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  };
  return {
    ...client,
    $transaction: vi.fn((callback) => {
      const result = transactionTail.then(() => callback(client));
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }),
  };
});

vi.mock("@gafus/prisma", () => ({ prisma: prismaMocks }));
vi.mock("./settingsService", () => ({
  resolveRewardedPlatformSettings: vi.fn().mockImplementation((platform) =>
    Promise.resolve({
      platform,
      platformEnabled: state.platformEnabled,
      placementId: "demo-rewarded-yandex",
      dailyAdLimit: state.dailyAdLimit,
      testMode: true,
    }),
  ),
}));

import {
  createRewardedAdSession,
  getRewardedAdStatus,
  grantRewardedTargetAccess,
  recordRewardedAdEvent,
} from "./adSessionService";

const TARGET = { targetType: "ARTICLE", targetId: "article-1" } as const;
const START = new Date("2026-08-05T10:00:00.000Z");

async function rewardedSession() {
  const session = await createRewardedAdSession({
    userId: "user-1",
    platform: "ANDROID",
    target: TARGET,
    now: START,
  });
  await recordRewardedAdEvent({
    userId: "user-1",
    sessionId: session.sessionId,
    eventType: "SHOWN",
    now: new Date(START.getTime() + 60_000),
  });
  await recordRewardedAdEvent({
    userId: "user-1",
    sessionId: session.sessionId,
    eventType: "REWARDED",
    now: new Date(START.getTime() + 120_000),
  });
  return session;
}

describe("rewarded ad direct target access", () => {
  beforeEach(() => {
    state.sessions.clear();
    state.accesses.clear();
    state.events.length = 0;
    state.dailyAdLimit = 1;
    state.platformEnabled = true;
    vi.clearAllMocks();
  });

  it("returns availability when the daily reward limit is not reached", async () => {
    await expect(
      getRewardedAdStatus({
        userId: "user-1",
        platform: "ANDROID",
        target: TARGET,
        now: START,
      }),
    ).resolves.toEqual({
      settings: { platformEnabled: true, testMode: true },
      canWatchAd: true,
      canWatchAdReason: "OK",
      target: { ...TARGET, unlocked: false, expiresAt: null },
    });
  });

  it("counts rewardedAt across platforms and test mode within Moscow calendar days", async () => {
    const makeReward = (id: string, platform: "ANDROID" | "IOS", rewardedAt: string): Session => ({
      id,
      userId: "user-1",
      platform,
      provider: "YANDEX",
      placementId: platform === "IOS" ? "ios-id" : "android-id",
      status: "GRANTED",
      targetType: "ARTICLE",
      targetId: `${id}-target`,
      requestNonceHash: `${id}-nonce`,
      expiresAt: new Date("2026-08-06T10:00:00.000Z"),
      rewardedAt: new Date(rewardedAt),
      grantedAt: new Date(rewardedAt),
      createdAt: new Date(rewardedAt),
    });
    // Moscow 2026-08-05 is [2026-08-04T21:00Z, 2026-08-05T21:00Z).
    state.sessions.set("before", makeReward("before", "ANDROID", "2026-08-04T20:59:59.999Z"));
    state.sessions.set("android", makeReward("android", "ANDROID", "2026-08-04T21:00:00.000Z"));
    state.sessions.set("ios", makeReward("ios", "IOS", "2026-08-05T20:59:59.999Z"));
    state.sessions.set("after", makeReward("after", "IOS", "2026-08-05T21:00:00.000Z"));
    state.dailyAdLimit = 2;

    await expect(
      getRewardedAdStatus({
        userId: "user-1",
        platform: "ANDROID",
        target: TARGET,
        now: START,
      }),
    ).resolves.toMatchObject({ canWatchAd: false, canWatchAdReason: "DAILY_LIMIT_REACHED" });
  });

  it("uses platform, active target, then daily limit priority", async () => {
    state.dailyAdLimit = 0;
    state.platformEnabled = false;
    await expect(
      getRewardedAdStatus({ userId: "user-1", platform: "IOS", target: TARGET, now: START }),
    ).resolves.toMatchObject({ canWatchAdReason: "PLATFORM_DISABLED" });

    state.platformEnabled = true;
    state.accesses.set("active", {
      id: "active",
      userId: "user-1",
      targetType: "ARTICLE",
      targetId: TARGET.targetId,
      source: "REWARDED_AD",
      platform: "IOS",
      sessionId: "old-session",
      grantedAt: START,
      expiresAt: new Date(START.getTime() + 60_000),
    });
    await expect(
      getRewardedAdStatus({ userId: "user-1", platform: "IOS", target: TARGET, now: START }),
    ).resolves.toMatchObject({ canWatchAdReason: "TARGET_ALREADY_ACTIVE" });
  });

  it("blocks session creation when zero or reached daily limit is configured", async () => {
    state.dailyAdLimit = 0;
    await expect(
      createRewardedAdSession({
        userId: "user-1",
        platform: "ANDROID",
        target: TARGET,
        now: START,
      }),
    ).rejects.toBeInstanceOf(RewardedDailyLimitReachedError);

    state.dailyAdLimit = 1;
    state.sessions.set("rewarded-yesterday", {
      id: "rewarded-yesterday",
      userId: "user-1",
      platform: "IOS",
      provider: "YANDEX",
      placementId: "ios-id",
      status: "GRANTED",
      targetType: "ARTICLE",
      targetId: "other-article",
      requestNonceHash: "old",
      expiresAt: START,
      rewardedAt: new Date("2026-08-04T21:00:00.000Z"),
      grantedAt: START,
      createdAt: START,
    });
    await expect(
      createRewardedAdSession({
        userId: "user-1",
        platform: "ANDROID",
        target: TARGET,
        now: START,
      }),
    ).rejects.toBeInstanceOf(RewardedDailyLimitReachedError);
  });

  it("creates a targeted server-owned session and keeps shown sessions exclusive", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    expect(session.requestNonce).toHaveLength(64);
    expect(state.sessions.get(session.sessionId)?.requestNonceHash).not.toBe(session.requestNonce);

    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: session.sessionId,
      eventType: "SHOWN",
    });
    await expect(
      createRewardedAdSession({
        userId: "user-1",
        platform: "ANDROID",
        target: TARGET,
        now: new Date(START.getTime() + 60_000),
      }),
    ).rejects.toMatchObject({ code: "REWARDED_SESSION_ALREADY_GRANTED" });
  });

  it("only creates course-step sessions for public free courses", async () => {
    await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: { targetType: "COURSE_STEP", targetId: "step-1" },
      now: START,
    });
    expect(prismaMocks.stepOnDay.findFirst).toHaveBeenCalledWith({
      where: {
        id: "step-1",
        day: {
          dayLinks: {
            some: { course: { isPaid: false, isPrivate: false } },
          },
        },
      },
      select: { id: true },
    });

    prismaMocks.stepOnDay.findFirst.mockResolvedValueOnce(null);
    await expect(
      createRewardedAdSession({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "COURSE_STEP", targetId: "paid-step" },
        now: START,
      }),
    ).rejects.toMatchObject({ code: "REWARDED_TARGET_NOT_FOUND" });
  });

  it("requires SHOWN before REWARDED", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    await expect(
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "REWARDED",
      }),
    ).rejects.toMatchObject({ code: "REWARDED_SESSION_INVALID_TRANSITION" });
  });

  it("rejects CREATED to DISMISSED to REWARDED without an immutable SHOWN event", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: session.sessionId,
      eventType: "DISMISSED",
      now: START,
    });

    await expect(
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "REWARDED",
        now: START,
      }),
    ).rejects.toMatchObject({ code: "REWARDED_SESSION_INVALID_TRANSITION" });
    expect(state.sessions.get(session.sessionId)?.rewardedAt).toBeNull();
    expect(state.events.filter((event) => event.eventType === "REWARDED")).toHaveLength(0);
  });

  it("accepts SHOWN to DISMISSED to REWARDED when callbacks arrive in that order", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    for (const eventType of ["SHOWN", "DISMISSED", "REWARDED"] as const) {
      await recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType,
        now: START,
      });
    }

    expect(state.sessions.get(session.sessionId)).toMatchObject({
      status: "REWARDED",
      rewardedAt: START,
    });
  });

  it("does not spend the limit on non-reward lifecycle events", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    for (const eventType of ["LOADED", "SHOWN", "DISMISSED"] as const) {
      await recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType,
        now: START,
      });
    }
    expect(state.sessions.get(session.sessionId)?.rewardedAt).toBeNull();
    await expect(
      getRewardedAdStatus({
        userId: "user-1",
        platform: "ANDROID",
        target: TARGET,
        now: START,
      }),
    ).resolves.toMatchObject({ canWatchAd: true, canWatchAdReason: "OK" });
  });

  it("accepts a reward racing with DISMISSED and preserves the rewarded status", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: session.sessionId,
      eventType: "SHOWN",
      now: START,
    });
    await Promise.all([
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "DISMISSED",
        now: START,
      }),
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "REWARDED",
        now: START,
      }),
    ]);
    expect(state.sessions.get(session.sessionId)).toMatchObject({
      status: "REWARDED",
      rewardedAt: START,
    });
  });

  it("serializes concurrent rewards, rejects overflow and replays accepted reward idempotently", async () => {
    const first = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    const second = await createRewardedAdSession({
      userId: "user-1",
      platform: "IOS",
      target: TARGET,
      now: START,
    });
    for (const sessionId of [first.sessionId, second.sessionId]) {
      await recordRewardedAdEvent({
        userId: "user-1",
        sessionId,
        eventType: "SHOWN",
        now: START,
      });
    }

    const results = await Promise.allSettled(
      [first.sessionId, second.sessionId].map((sessionId) =>
        recordRewardedAdEvent({
          userId: "user-1",
          sessionId,
          eventType: "REWARDED",
          now: START,
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "REWARDED_DAILY_LIMIT_REACHED" },
    });
    const rewardedSessions = [...state.sessions.values()].filter(
      (session) => session.rewardedAt !== null,
    );
    expect(rewardedSessions).toHaveLength(1);

    const accepted = [...state.sessions.values()].find((session) => session.rewardedAt !== null)!;
    const rewardedEventsBeforeReplay = state.events.filter(
      (event) => event.eventType === "REWARDED",
    ).length;
    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: accepted.id,
      eventType: "REWARDED",
      now: START,
    });
    expect(state.events.filter((event) => event.eventType === "REWARDED")).toHaveLength(
      rewardedEventsBeforeReplay,
    );
    expect(prismaMocks.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "rewarded-daily-limit:user-1",
    );
  });

  it("grants exactly seven days and replays idempotently without extending", async () => {
    const session = await rewardedSession();
    const grantAt = new Date("2026-08-05T10:03:00.000Z");
    const first = await grantRewardedTargetAccess({
      userId: "user-1",
      sessionId: session.sessionId,
      requestNonce: session.requestNonce,
      now: grantAt,
    });
    expect(first).toMatchObject({ ...TARGET, replay: false });
    expect(first.expiresAt).toBe("2026-08-12T10:03:00.000Z");

    const replay = await grantRewardedTargetAccess({
      userId: "user-1",
      sessionId: session.sessionId,
      requestNonce: session.requestNonce,
      now: new Date("2026-08-06T10:03:00.000Z"),
    });
    expect(replay).toEqual({ ...first, replay: true });
    expect(state.accesses.size).toBe(1);
  });

  it("grants an accepted reward even if DISMISSED won the lifecycle status race", async () => {
    const session = await rewardedSession();
    const persisted = state.sessions.get(session.sessionId)!;
    const rewardedAt = persisted.rewardedAt;
    persisted.status = "DISMISSED";

    await expect(
      grantRewardedTargetAccess({
        userId: "user-1",
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        now: new Date("2026-08-05T10:03:00.000Z"),
      }),
    ).resolves.toMatchObject({ ...TARGET, replay: false });
    expect(state.sessions.get(session.sessionId)).toMatchObject({
      status: "GRANTED",
      rewardedAt,
    });
  });

  it("grants an already accepted reward after the administrator lowers the limit", async () => {
    state.dailyAdLimit = 1;
    const session = await rewardedSession();
    state.dailyAdLimit = 0;

    await expect(
      grantRewardedTargetAccess({
        userId: "user-1",
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        now: new Date("2026-08-05T10:03:00.000Z"),
      }),
    ).resolves.toMatchObject({ ...TARGET, replay: false });
  });

  it("does not allow a new ad while target access is active", async () => {
    const session = await rewardedSession();
    await grantRewardedTargetAccess({
      userId: "user-1",
      sessionId: session.sessionId,
      requestNonce: session.requestNonce,
      now: new Date("2026-08-05T10:03:00.000Z"),
    });

    await expect(
      createRewardedAdSession({
        userId: "user-1",
        platform: "IOS",
        target: TARGET,
        now: new Date("2026-08-06T10:03:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "TARGET_ALREADY_ACTIVE" });
  });

  it("expires stale sessions before grant", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      target: TARGET,
      now: START,
    });
    await expect(
      grantRewardedTargetAccess({
        userId: "user-1",
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        now: new Date("2026-08-05T10:11:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(RewardedAdSessionError);
    expect(state.sessions.get(session.sessionId)?.status).toBe("EXPIRED");
  });
});

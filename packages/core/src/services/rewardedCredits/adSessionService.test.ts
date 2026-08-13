import { beforeEach, describe, expect, it, vi } from "vitest";

import { RewardedAdSessionError } from "./errors";

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
}));

const prismaMocks = vi.hoisted(() => {
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
          ) ?? null,
        ),
      ),
      create: vi.fn(({ data }) => {
        state.events.push(data);
        return Promise.resolve({ id: `event-${state.events.length}`, ...data });
      }),
    },
    article: { findFirst: vi.fn().mockResolvedValue({ id: "article-1" }) },
    stepOnDay: { findFirst: vi.fn().mockResolvedValue({ id: "step-1" }) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  };
  return {
    ...client,
    $transaction: vi.fn((callback) => callback(client)),
  };
});

vi.mock("@gafus/prisma", () => ({ prisma: prismaMocks }));
vi.mock("./settingsService", () => ({
  resolveRewardedPlatformSettings: vi.fn().mockResolvedValue({
    platform: "ANDROID",
    platformEnabled: true,
    placementId: "demo-rewarded-yandex",
    testMode: true,
  }),
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
  });
  await recordRewardedAdEvent({
    userId: "user-1",
    sessionId: session.sessionId,
    eventType: "REWARDED",
  });
  return session;
}

describe("rewarded ad direct target access", () => {
  beforeEach(() => {
    state.sessions.clear();
    state.accesses.clear();
    state.events.length = 0;
    vi.clearAllMocks();
  });

  it("returns unlimited availability without wallet or daily-limit data", async () => {
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
    });

    await Promise.all([
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "REWARDED",
      }),
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "DISMISSED",
      }),
    ]);

    expect(state.sessions.get(session.sessionId)).toMatchObject({
      status: "REWARDED",
    });
    expect(state.sessions.get(session.sessionId)?.rewardedAt).toBeInstanceOf(Date);
  });

  it("accepts REWARDED after DISMISSED when SHOWN was recorded", async () => {
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
      });
    }

    expect(state.sessions.get(session.sessionId)).toMatchObject({ status: "REWARDED" });
    expect(state.sessions.get(session.sessionId)?.rewardedAt).toBeInstanceOf(Date);
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

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RewardedAdSessionError } from "./errors";

const state = vi.hoisted(() => ({
  sessions: new Map<
    string,
    {
      id: string;
      userId: string;
      platform: string;
      provider: string;
      placementId: string;
      status: string;
      targetType: string | null;
      targetId: string | null;
      requestNonceHash: string;
      expiresAt: Date;
      rewardedAt: Date | null;
      grantedAt: Date | null;
      createdAt: Date;
    }
  >(),
  events: [] as { sessionId: string; eventType: string; payload?: unknown }[],
}));

const prismaMocks = vi.hoisted(() => ({
  findFirst: vi.fn(({ where }) =>
    Promise.resolve(
      [...state.sessions.values()].find(
        (session) =>
          session.userId === where.userId &&
          session.platform === where.platform &&
          where.status.in.includes(session.status) &&
          session.expiresAt > where.expiresAt.gt &&
          (where.targetType === undefined || session.targetType === where.targetType) &&
          (where.targetId === undefined || session.targetId === where.targetId),
      ) ?? null,
    ),
  ),
  findUnique: vi.fn(({ where }) => Promise.resolve(state.sessions.get(where.id) ?? null)),
  create: vi.fn(({ data }) => {
    const session = {
      id: `session-${state.sessions.size + 1}`,
      provider: "YANDEX",
      status: "CREATED",
      rewardedAt: null,
      grantedAt: null,
      createdAt: new Date("2026-05-31T10:00:00.000Z"),
      ...data,
      targetType: data.targetType ?? null,
      targetId: data.targetId ?? null,
    };
    state.sessions.set(session.id, session);
    return Promise.resolve(session);
  }),
  update: vi.fn(({ where, data }) => {
    const session = state.sessions.get(where.id);
    if (!session) {
      throw new Error("missing session");
    }
    Object.assign(session, data);
    return Promise.resolve(session);
  }),
  eventCreate: vi.fn(({ data }) => {
    state.events.push(data);
    return Promise.resolve({ id: `event-${state.events.length}`, ...data });
  }),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    rewardedAdSession: {
      findFirst: prismaMocks.findFirst,
      findUnique: prismaMocks.findUnique,
      create: prismaMocks.create,
      update: prismaMocks.update,
    },
    rewardedAdEvent: {
      create: prismaMocks.eventCreate,
    },
  },
}));

vi.mock("./settingsService", () => ({
  resolveRewardedPlatformSettings: vi.fn().mockResolvedValue({
    platform: "ANDROID",
    platformEnabled: true,
    paywallCtaEnabled: true,
    placementId: "demo-rewarded-yandex",
    dailyAdLimit: 1,
    testMode: true,
  }),
}));

const grantRewardedCreditsToWallet = vi.fn().mockResolvedValue({
  grantedCredits: 5,
  balance: 5,
  pendingRefundCredits: 0,
  maxBalance: 5,
  adsWatchedToday: 1,
  dailyAdLimit: 1,
  canWatchAd: false,
  replay: false,
});

vi.mock("./walletService", () => ({
  getRewardedCreditsStatus: vi.fn().mockResolvedValue({
    wallet: { balance: 0, pendingRefundCredits: 0, maxBalance: 5, creditsPerReward: 5 },
    today: { adsWatchedToday: 0, dailyAdLimit: 1, limitResetAt: "2026-06-01T00:00:00.000Z" },
    canWatchAd: true,
    canWatchAdReason: "OK",
    nextGrantCredits: 5,
  }),
  grantRewardedCreditsToWallet: (...args: unknown[]) => grantRewardedCreditsToWallet(...args),
}));

import {
  createRewardedAdSession,
  grantRewardedCredits,
  recordRewardedAdEvent,
} from "./adSessionService";

describe("rewarded ad sessions", () => {
  beforeEach(() => {
    state.sessions.clear();
    state.events.length = 0;
    vi.clearAllMocks();
  });

  it("creates a server-owned session with a one-time raw nonce", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      now: new Date("2026-05-31T10:00:00.000Z"),
    });

    expect(session).toMatchObject({
      sessionId: "session-1",
      provider: "YANDEX",
      placementId: "demo-rewarded-yandex",
      platform: "ANDROID",
      testMode: true,
    });
    expect(session.requestNonce).toHaveLength(64);
    expect([...state.sessions.values()][0].requestNonceHash).not.toBe(session.requestNonce);
  });

  it("records lifecycle events and moves status forward", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      now: new Date("2026-05-31T10:00:00.000Z"),
    });

    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: session.sessionId,
      eventType: "SHOWN",
      payload: { adapter: "test" },
    });

    expect(state.events).toEqual([
      { sessionId: session.sessionId, eventType: "SHOWN", payload: { adapter: "test" } },
    ]);
    expect(state.sessions.get(session.sessionId)?.status).toBe("SHOWN");
  });

  it("rejects rewarded callbacks before the ad is shown", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      now: new Date("2026-05-31T10:00:00.000Z"),
    });

    await expect(
      recordRewardedAdEvent({
        userId: "user-1",
        sessionId: session.sessionId,
        eventType: "REWARDED",
        payload: { amount: 1 },
      }),
    ).rejects.toMatchObject({ code: "REWARDED_SESSION_INVALID_TRANSITION" });
    expect(state.events).toEqual([]);
    expect(state.sessions.get(session.sessionId)?.status).toBe("CREATED");
  });

  it("does not grant before the provider rewarded callback is recorded", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      now: new Date("2026-05-31T10:00:00.000Z"),
    });

    await expect(
      grantRewardedCredits({
        userId: "user-1",
        sessionId: session.sessionId,
        requestNonce: "wrong",
        now: new Date("2026-05-31T10:01:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "REWARDED_SESSION_INVALID_NONCE" });

    await expect(
      grantRewardedCredits({
        userId: "user-1",
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        now: new Date("2026-05-31T10:01:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "REWARDED_SESSION_NOT_REWARDED" });

    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: session.sessionId,
      eventType: "SHOWN",
    });
    await recordRewardedAdEvent({
      userId: "user-1",
      sessionId: session.sessionId,
      eventType: "REWARDED",
      payload: { amount: 1 },
    });

    await grantRewardedCredits({
      userId: "user-1",
      sessionId: session.sessionId,
      requestNonce: session.requestNonce,
      now: new Date("2026-05-31T10:01:00.000Z"),
    });

    expect(grantRewardedCreditsToWallet).toHaveBeenCalledTimes(1);
    expect(state.sessions.get(session.sessionId)?.status).toBe("GRANTED");
  });

  it("expires stale sessions before grant", async () => {
    const session = await createRewardedAdSession({
      userId: "user-1",
      platform: "ANDROID",
      now: new Date("2026-05-31T10:00:00.000Z"),
    });

    await expect(
      grantRewardedCredits({
        userId: "user-1",
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        now: new Date("2026-05-31T10:11:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(RewardedAdSessionError);
    expect(state.sessions.get(session.sessionId)?.status).toBe("EXPIRED");
  });
});

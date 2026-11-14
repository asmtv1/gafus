import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countRewardedDayRows,
  existsPublicRewardedArticle,
  existsPublicRewardedStep,
  findActiveRewardedAccess,
  findBlockingAdSession,
  createAdSessionRow,
  findRewardedAdSessionRow,
  withRewardedDailyLock,
  withRewardedAccessLock,
  readShownRewardedEvent,
  readDailyRewardedSettings,
  appendRewardedAdEvent,
  markAdSessionRewarded,
  markAdSessionNonRewardedStatus,
  findRewardedGrantBySession,
  createRewardedAccessGrant,
  markAdSessionGranted,
} from "./rewardedAdRows";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  count: vi.fn(),
  article: vi.fn(),
  step: vi.fn(),
  active: vi.fn(),
  blocking: vi.fn(),
  createSession: vi.fn(),
  session: vi.fn(),
  event: vi.fn(),
  eventFind: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  settings: vi.fn(),
  grant: vi.fn(),
  grantCreate: vi.fn(),
}));
const tx = {
  $executeRawUnsafe: db.lock,
  rewardedAdSession: {
    count: db.count,
    findUnique: db.session,
    update: db.sessionUpdate,
    updateMany: db.sessionUpdateMany,
  },
  rewardedAdEvent: { findFirst: db.eventFind, create: db.event },
  rewardedAdSettings: { findUnique: db.settings },
  rewardedTargetAccess: { findFirst: db.active, findUnique: db.grant, create: db.grantCreate },
};
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
    rewardedAdSession: {
      count: db.count,
      findFirst: db.blocking,
      findUnique: db.session,
      create: db.createSession,
      update: db.sessionUpdate,
      updateMany: db.sessionUpdateMany,
    },
    article: { findFirst: db.article },
    stepOnDay: { findFirst: db.step },
    rewardedTargetAccess: { findFirst: db.active, findUnique: db.grant },
    rewardedAdEvent: { create: db.event },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (fn) => fn(tx));
});

describe("ad session and access SQL row port", () => {
  it("owner+target+time scoped read filters are exact", async () => {
    const start = new Date("2026-11-10T00:00:00Z");
    const end = new Date("2026-11-11T00:00:00Z");
    await countRewardedDayRows("owner", start, end);
    expect(db.count).toHaveBeenCalledWith({
      where: { userId: "owner", rewardedAt: { gte: start, lt: end } },
    });
    db.article.mockResolvedValue({ id: "article" });
    db.step.mockResolvedValue({ id: "step" });
    expect(await existsPublicRewardedArticle("article")).toBe(true);
    expect(await existsPublicRewardedStep("step")).toBe(true);
    expect(db.article).toHaveBeenCalledWith({
      where: { id: "article", visibility: "PUBLIC" },
      select: { id: true },
    });
    expect(db.step).toHaveBeenCalledWith({
      where: {
        id: "step",
        day: { dayLinks: { some: { course: { isPaid: false, isPrivate: false } } } },
      },
      select: { id: true },
    });
    await findActiveRewardedAccess("owner", { targetType: "ARTICLE", targetId: "article" }, end);
    expect(db.active).toHaveBeenCalledWith({
      where: {
        userId: "owner",
        targetType: "ARTICLE",
        targetId: "article",
        expiresAt: { gt: end },
      },
      orderBy: { expiresAt: "desc" },
    });
    await findBlockingAdSession(
      "owner",
      "IOS",
      { targetType: "ARTICLE", targetId: "article" },
      ["SHOWN", "REWARDED"],
      end,
    );
    expect(db.blocking).toHaveBeenCalledWith({
      where: {
        userId: "owner",
        platform: "IOS",
        status: { in: ["SHOWN", "REWARDED"] },
        expiresAt: { gt: end },
        targetType: "ARTICLE",
        targetId: "article",
      },
    });
  });

  it("daily grant lock is held through event write and status CAS", async () => {
    await withRewardedDailyLock("owner", async (txClient) => {
      expect(txClient).toBe(tx);
      await readShownRewardedEvent(txClient, "session");
      await readDailyRewardedSettings(txClient);
      await appendRewardedAdEvent(
        { sessionId: "session", eventType: "REWARDED", payload: { source: "test" } },
        txClient,
      );
      await markAdSessionRewarded(txClient, "session", new Date("2026-11-10T01:00:00Z"));
    });
    expect(db.lock).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "rewarded-daily-limit:owner",
    );
    expect(db.eventFind).toHaveBeenCalledWith({
      where: { sessionId: "session", eventType: "SHOWN" },
      select: { id: true },
    });
    expect(db.settings).toHaveBeenCalledWith({
      where: { key: "default" },
      select: { dailyAdLimit: true },
    });
    expect(db.event).toHaveBeenCalledWith({
      data: { sessionId: "session", eventType: "REWARDED", payload: { source: "test" } },
    });
  });

  it("target grant lock maintains session ownership, replay, and effective grant writes", async () => {
    const target = { targetType: "ARTICLE" as const, targetId: "article" };
    const now = new Date("2026-11-10T01:00:00Z");
    await withRewardedAccessLock("owner", target, async (txClient) => {
      await findRewardedGrantBySession("session", txClient);
      await createRewardedAccessGrant(txClient, {
        userId: "owner",
        target,
        platform: "IOS",
        sessionId: "session",
        now,
        expiresAt: new Date("2026-11-17T01:00:00Z"),
      });
      await markAdSessionGranted(txClient, {
        sessionId: "session",
        rewardedAt: now,
        grantedAt: now,
      });
    });
    expect(db.lock).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "rewarded-access:owner:ARTICLE:article",
    );
    expect(db.grant).toHaveBeenCalledWith({ where: { sessionId: "session" } });
    expect(db.grantCreate).toHaveBeenCalledWith({
      data: {
        userId: "owner",
        targetType: "ARTICLE",
        targetId: "article",
        source: "REWARDED_AD",
        platform: "IOS",
        sessionId: "session",
        grantedAt: now,
        expiresAt: new Date("2026-11-17T01:00:00Z"),
      },
    });
    expect(db.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session" },
      data: { status: "GRANTED", providerPayload: undefined, rewardedAt: now, grantedAt: now },
    });
  });

  it("non-rewarded event cannot override a newly awarded reward", async () => {
    await markAdSessionNonRewardedStatus("session", "SHOWN", "FAILED", true);
    expect(db.sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: "session", status: "SHOWN", rewardedAt: null },
      data: { status: "FAILED", errorCode: "CLIENT_EVENT_FAILED" },
    });
    await createAdSessionRow({
      userId: "owner",
      platform: "IOS",
      placementId: "placement",
      requestNonceHash: "hash",
      expiresAt: new Date("2026-11-10T23:00:00Z"),
      target: { targetType: "ARTICLE", targetId: "article" },
    });
    expect(db.createSession).toHaveBeenCalledWith({
      data: {
        userId: "owner",
        platform: "IOS",
        provider: "YANDEX",
        placementId: "placement",
        requestNonceHash: "hash",
        expiresAt: new Date("2026-11-10T23:00:00Z"),
        targetType: "ARTICLE",
        targetId: "article",
      },
    });
    await findRewardedAdSessionRow("session");
    expect(db.session).toHaveBeenCalledWith({ where: { id: "session" } });
  });
});

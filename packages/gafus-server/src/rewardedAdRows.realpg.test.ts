/** Real owner-fenced rewarded ad row transitions on disposable loopback PostgreSQL18. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  createAdSessionRow,
  findRewardedAdSessionRow,
  countRewardedDayRows,
  withRewardedDailyLock,
  withRewardedAccessLock,
  appendRewardedAdEvent,
  markAdSessionRewarded,
  findRewardedGrantBySession,
  createRewardedAccessGrant,
  markAdSessionGranted,
  markAdSessionNonRewardedStatus,
  findActiveRewardedAccess,
} from "./rewardedAdRows";
const qa = describe.runIf(process.env.GAFUS_REWARDED_AD_ROWS_REAL_PG === "enabled");
const owner = "ad-session-qa-owner",
  other = "ad-session-qa-other";
const target = { targetType: "ARTICLE" as const, targetId: "synthetic-article" };
const at = new Date("2026-11-10T19:00:00Z");
let sessionId = "",
  isolated = false;
qa("rewarded ad session owner/lock/CAS on local PostgreSQL18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_rewarded_ad_rows_qa");
    const session = await prisma.$queryRawUnsafe<{ db: string; v: number }[]>(
      "SELECT current_database() AS db,current_setting('server_version_num')::integer AS v",
    );
    expect(session[0]?.db).toBe("gafus_rewarded_ad_rows_qa");
    expect(session[0]?.v).toBeGreaterThanOrEqual(180000);
    isolated = true;
    await prisma.user.createMany({
      data: [
        { id: owner, username: owner, password: "fictional-test-only", role: "USER" },
        { id: other, username: other, password: "fictional-test-only", role: "USER" },
      ],
    });
  });
  afterAll(async () => {
    if (!isolated) return;
    await prisma.rewardedTargetAccess.deleteMany({ where: { userId: { in: [owner, other] } } });
    await prisma.rewardedAdEvent.deleteMany({
      where: { session: { userId: { in: [owner, other] } } },
    });
    await prisma.rewardedAdSession.deleteMany({ where: { userId: { in: [owner, other] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.$disconnect();
  });
  it("creates only the specified user's ad session", async () => {
    const session = await createAdSessionRow({
      userId: owner,
      platform: "IOS",
      placementId: "synthetic-placement",
      requestNonceHash: "sha256-qa-unique",
      expiresAt: new Date("2026-11-12T00:00:00Z"),
      target,
    });
    sessionId = session.id;
    expect((await findRewardedAdSessionRow(sessionId))?.userId).toBe(owner);
    expect(
      await countRewardedDayRows(
        other,
        new Date("2026-11-10T00:00:00Z"),
        new Date("2026-11-11T00:00:00Z"),
      ),
    ).toBe(0);
  });
  it("writes one rewarded event and updates server-recognized timestamp atomically", async () => {
    await withRewardedDailyLock(owner, async (tx) => {
      await appendRewardedAdEvent({ sessionId, eventType: "SHOWN" }, tx);
      await appendRewardedAdEvent(
        { sessionId, eventType: "REWARDED", payload: { kind: "synthetic" } },
        tx,
      );
      await markAdSessionRewarded(tx, sessionId, at);
    });
    expect((await findRewardedAdSessionRow(sessionId))?.status).toBe("REWARDED");
    expect(
      await countRewardedDayRows(
        owner,
        new Date("2026-11-10T00:00:00Z"),
        new Date("2026-11-11T00:00:00Z"),
      ),
    ).toBe(1);
  });
  it("creates only one entitlement for a rewarded session under a resource lock", async () => {
    const first = await withRewardedAccessLock(owner, target, async (tx) => {
      const active = await findActiveRewardedAccess(owner, target, at, tx);
      expect(active).toBeNull();
      const granted = await createRewardedAccessGrant(tx, {
        userId: owner,
        target,
        platform: "IOS",
        sessionId,
        now: at,
        expiresAt: new Date("2026-11-17T19:00:00Z"),
      });
      await markAdSessionGranted(tx, { sessionId, rewardedAt: at, grantedAt: at });
      return granted;
    });
    expect((await findRewardedGrantBySession(sessionId))?.id).toBe(first.id);
    expect((await findActiveRewardedAccess(owner, target, at))?.id).toBe(first.id);
    expect(await findActiveRewardedAccess(other, target, at)).toBeNull();
    expect(await prisma.rewardedTargetAccess.count({ where: { sessionId } })).toBe(1);
    await markAdSessionNonRewardedStatus(sessionId, "SHOWN", "FAILED", true);
    expect((await findRewardedAdSessionRow(sessionId))?.status).toBe("GRANTED");
  });
  it("rolls back a failed resource-lock transaction", async () => {
    await expect(
      withRewardedAccessLock(owner, target, async (tx) => {
        await tx.rewardedAdSession.update({ where: { id: sessionId }, data: { status: "FAILED" } });
        throw Error("SYNTHETIC_ROLLBACK");
      }),
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");
    expect((await findRewardedAdSessionRow(sessionId))?.status).toBe("GRANTED");
  });
});

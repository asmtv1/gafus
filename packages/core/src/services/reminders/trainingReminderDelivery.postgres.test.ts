import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  acknowledgeDailyTrainingReminderDelivery,
  claimDailyTrainingReminderDelivery,
  listRetryableTrainingReminderCandidates,
  trainingReminderLocalDayKey,
} from "./trainingReminderDelivery";

const isolated = process.env.GAFUS_ISOLATED_TEST_DB === "1" &&
  (process.env.DATABASE_URL ?? "").includes("/gafus_refactor_concurrency");

describe.skipIf(!isolated)("training reminder recovery on disposable PostgreSQL", () => {
  const at = new Date("2026-10-11T06:30:00.000Z");
  let userId = "";
  let reminderId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: `test-reminder-${randomUUID()}`, password: randomUUID(), role: "USER" },
    });
    userId = user.id;
    const reminder = await prisma.reminder.create({
      data: {
        userId, type: "training", name: "Training",
        enabled: true, reminderTime: "09:30", reminderDays: "7", timezone: "Europe/Moscow",
      },
    });
    reminderId = reminder.id;
  });

  afterAll(async () => {
    if (reminderId) await prisma.reminder.delete({ where: { id: reminderId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("allows only one active lease for concurrent workers", async () => {
    const claim = { reminderId, userId, timezone: "Europe/Moscow", now: at };
    const [a, b] = await Promise.all([
      claimDailyTrainingReminderDelivery(claim),
      claimDailyTrainingReminderDelivery(claim),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const records = await prisma.trainingReminderDelivery.findMany({ where: { reminderId } });
    expect(records).toHaveLength(1);
    expect(records[0].attemptCount).toBe(1);
  });

  it("recovers an expired lease and rejects the stale acknowledgement", async () => {
    const dayKey = trainingReminderLocalDayKey("Europe/Moscow", at);
    const previous = await prisma.trainingReminderDelivery.findUniqueOrThrow({
      where: { reminderId_localDate: { reminderId, localDate: dayKey } },
    });
    await prisma.trainingReminderDelivery.update({
      where: { id: previous.id },
      data: { leaseExpiresAt: new Date(at.getTime() - 1000) },
    });
    const retryCandidates = await listRetryableTrainingReminderCandidates(
      new Date(at.getTime() + 60 * 60_000),
    );
    expect(retryCandidates.map(item => item.id)).toContain(reminderId);

    const nextToken = await claimDailyTrainingReminderDelivery({
      reminderId, userId, timezone: "Europe/Moscow", now: at,
    });
    expect(nextToken).toEqual(expect.any(String));
    expect(nextToken).not.toBe(previous.leaseToken);
    expect(await acknowledgeDailyTrainingReminderDelivery({
      reminderId, timezone: "Europe/Moscow",
      token: previous.leaseToken!, claimedAt: at, now: at,
    })).toBe(false);
    expect(await acknowledgeDailyTrainingReminderDelivery({
      reminderId, timezone: "Europe/Moscow",
      token: nextToken!, claimedAt: at, now: at,
    })).toBe(true);
    const saved = await prisma.trainingReminderDelivery.findUniqueOrThrow({
      where: { reminderId_localDate: { reminderId, localDate: dayKey } },
    });
    expect(saved.status).toBe("SENT");
    expect(saved.attemptCount).toBe(2);
    expect(await claimDailyTrainingReminderDelivery({
      reminderId, userId, timezone: "Europe/Moscow", now: at,
    })).toBe(null);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  findReminder: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  updateReminder: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
    trainingReminderDelivery: {
      updateMany: db.updateMany,
      findMany: db.findMany,
    },
  },
}));

import {
  claimDailyTrainingReminderDelivery,
  acknowledgeDailyTrainingReminderDelivery,
  releaseDailyTrainingReminderDelivery,
  listRetryableTrainingReminderCandidates,
  trainingReminderLocalDayKey,
} from "./trainingReminderDelivery";

describe("durable training reminder delivery", () => {
  const now = new Date("2026-10-11T06:30:00Z");
  const input = { reminderId: "rem-1", userId: "u1", timezone: "Europe/Moscow", now };

  beforeEach(() => {
    vi.clearAllMocks();
    db.findReminder.mockResolvedValue({ lastSentAt: null });
    db.createMany.mockResolvedValue({ count: 1 });
    db.updateMany.mockResolvedValue({ count: 1 });
    db.updateReminder.mockResolvedValue({});
    db.findMany.mockResolvedValue([]);
    db.transaction.mockImplementation(async fn => fn({
      reminder: { findFirst: db.findReminder, update: db.updateReminder },
      trainingReminderDelivery: {
        createMany: db.createMany, updateMany: db.updateMany,
      },
    }));
  });

  it("uses the recipient's local day for deduplication", () => {
    expect(trainingReminderLocalDayKey("Europe/Moscow", new Date("2026-10-10T22:10:00Z")))
      .toBe("2026-10-11");
  });

  it("uses a unique-day record and claims an available lease", async () => {
    const token = await claimDailyTrainingReminderDelivery(input);
    expect(token).toEqual(expect.any(String));
    expect(db.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({ reminderId: "rem-1", localDate: "2026-10-11" })],
    }));
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "PENDING",
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      }),
      data: expect.objectContaining({ leaseToken: token }),
    }));
  });

  it("refuses a second worker while the first lease is active", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimDailyTrainingReminderDelivery(input)).toBe(null);
  });

  it("does not claim a reminder already delivered today", async () => {
    db.findReminder.mockResolvedValue({ lastSentAt: now });
    expect(await claimDailyTrainingReminderDelivery(input)).toBe(null);
    expect(db.createMany).not.toHaveBeenCalled();
  });

  it("only the lease owner may confirm and update lastSentAt", async () => {
    expect(await acknowledgeDailyTrainingReminderDelivery({
      reminderId: "rem-1", timezone: "Europe/Moscow",
      token: "lease-1", claimedAt: now, now,
    })).toBe(true);
    expect(db.updateReminder).toHaveBeenCalledWith({
      where: { id: "rem-1" },
      data: { lastSentAt: now },
    });
  });

  it("does not mark an outdated lease as delivered", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await acknowledgeDailyTrainingReminderDelivery({
      reminderId: "rem-1", timezone: "Europe/Moscow",
      token: "stale", claimedAt: now, now,
    })).toBe(false);
    expect(db.updateReminder).not.toHaveBeenCalled();
  });

  it("only releases the current lease token", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await releaseDailyTrainingReminderDelivery({
      reminderId: "rem-1", timezone: "Europe/Moscow",
      token: "stale", claimedAt: now, now,
    })).toBe(false);
  });

  it("recovers expired daily claims even after the scheduled clock window", async () => {
    const reminder = {
      id: "rem-1", userId: "u1", name: "Тренировка",
      timezone: "Europe/Moscow", reminderTime: "09:30", reminderDays: "7", lastSentAt: null,
    };
    db.findMany.mockResolvedValue([
      { localDate: "2026-10-11", reminder },
      { localDate: "2026-10-10", reminder },
    ]);
    const recovered = await listRetryableTrainingReminderCandidates(new Date("2026-10-11T10:00:00Z"));
    expect(recovered).toEqual([reminder]);
  });
});

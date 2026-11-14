/** Opt-in disposable loopback PostgreSQL 18 acceptance: no shared databases. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readPublicSlotCynologist,
  readTrainerSlotCynologist,
  readCynologistDayOffDates,
  readLatestCynologistSlot,
  countCynologistWorkingRules,
  readFreeCynologistSlots,
  readCalendarCynologistSlots,
  readVerifiedConsultationSlot,
  readExistingCynologistSlots,
  readCynologistSlotSchedule,
  withSlotTransaction,
  lockCynologistSlotHorizon,
  updateCynologistSlotStatuses,
  createMissingCynologistSlots,
  blockCynologistExceptionOverlap,
  deleteCynologistSlots,
} from "./slotRows";

const qa = describe.runIf(process.env.GAFUS_SLOT_ROWS_REAL_PG === "enabled");
const userId = "slot-rows-qa-trainer";
const otherId = "slot-rows-qa-other";
const cynId = "slot-rows-qa-cyn";
const monday = new Date("2026-11-23T08:00:00.000Z");
const nextSlot = new Date("2026-11-23T08:30:00.000Z");
const end = new Date("2026-11-23T09:30:00.000Z");
let freeId = "";
let blockedId = "";
let verifiedDisposableDb = false;

qa("transaction-safe consultation slot SQL on real PostgreSQL18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_slot_rows_qa");
    const identity = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(identity[0]?.db).toBe("gafus_slot_rows_qa");
    expect(identity[0]?.version).toBeGreaterThanOrEqual(180000);
    verifiedDisposableDb = true;
    await prisma.user.createMany({
      data: [
        { id: userId, username: userId, password: "fictional-test-only", role: "TRAINER" },
        { id: otherId, username: otherId, password: "fictional-test-only", role: "TRAINER" },
      ],
    });
    await prisma.consultationCynologist.create({
      data: {
        id: cynId,
        userId,
        slotDurationMin: 30,
        slotHorizonDays: 30,
        availabilityRules: {
          create: { weekday: 1, startTime: "10:00", endTime: "12:00", isWorkingDay: true },
        },
      },
    });
    const free = await prisma.consultationSlot.create({
      data: { cynologistId: cynId, startAt: monday, endAt: nextSlot, status: "FREE" },
    });
    const blocked = await prisma.consultationSlot.create({
      data: {
        cynologistId: cynId,
        startAt: nextSlot,
        endAt: new Date("2026-11-23T09:00:00.000Z"),
        status: "BLOCKED",
      },
    });
    freeId = free.id;
    blockedId = blocked.id;
  });
  afterAll(async () => {
    if (!verifiedDisposableDb) return;
    await prisma.consultationCynologist.deleteMany({ where: { id: cynId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  it("scopes public and trainer calendar rows by user and filters FREE vs BLOCKED", async () => {
    expect((await readPublicSlotCynologist(userId))?.id).toBe(cynId);
    expect((await readTrainerSlotCynologist(userId))?.id).toBe(cynId);
    expect(await readPublicSlotCynologist(otherId)).toBeNull();
    expect(await countCynologistWorkingRules(cynId)).toBe(1);
    expect(await readCynologistDayOffDates(cynId)).toEqual([]);
    expect((await readLatestCynologistSlot(cynId))?.startAt).toEqual(nextSlot);
    const active = ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"] as const;
    expect((await readFreeCynologistSlots(cynId, monday, end, active)).map((s) => s.id)).toEqual([
      freeId,
    ]);
    expect(
      (await readCalendarCynologistSlots(cynId, monday, end, active)).map((s) => s.id),
    ).toEqual([freeId, blockedId]);
    expect((await readVerifiedConsultationSlot(freeId, userId, active))?.status).toBe("FREE");
    expect(await readVerifiedConsultationSlot(freeId, otherId, active)).toBeNull();
  });

  it("keeps advisory lock, projections, mass changes and inserts in ONE transaction", async () => {
    const active = ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"] as const;
    await withSlotTransaction(
      async (tx) => {
        await lockCynologistSlotHorizon(tx, cynId);
        const schedule = await readCynologistSlotSchedule(tx, cynId);
        expect(schedule?.availabilityRules).toHaveLength(1);
        const existing = await readExistingCynologistSlots(tx, cynId, monday, end, active);
        expect(existing.map((row) => row.id).sort()).toEqual([freeId, blockedId].sort());
        await updateCynologistSlotStatuses(tx, [freeId], "BLOCKED");
        await createMissingCynologistSlots(tx, cynId, [
          { startAt: new Date("2026-11-23T09:00:00.000Z"), endAt: end },
        ]);
        await blockCynologistExceptionOverlap(tx, cynId, monday, nextSlot);
      },
      { maxWait: 10000, timeout: 120000 },
    );
    expect(
      (await prisma.consultationSlot.findUniqueOrThrow({ where: { id: freeId } })).status,
    ).toBe("BLOCKED");
    expect(await prisma.consultationSlot.count({ where: { cynologistId: cynId } })).toBe(3);
  });

  it("deduplicates missing slot insert and cannot mutate unrelated trainer's slots", async () => {
    const newSlot = new Date("2026-11-23T09:00:00.000Z");
    await withSlotTransaction(
      async (tx) => {
        await createMissingCynologistSlots(tx, cynId, [{ startAt: newSlot, endAt: end }]);
        await deleteCynologistSlots(tx, [blockedId]);
      },
      { maxWait: 10000, timeout: 120000 },
    );
    expect(await prisma.consultationSlot.count({ where: { cynologistId: cynId } })).toBe(2);
    expect(await readPublicSlotCynologist(otherId)).toBeNull();
  });
});

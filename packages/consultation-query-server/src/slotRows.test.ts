import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withSlotTransaction,
  readCynologistDayOffDates,
  readLatestCynologistSlot,
  countCynologistWorkingRules,
  lockCynologistSlotHorizon,
  readCynologistSlotSchedule,
  readExistingCynologistSlots,
  updateCynologistSlotStatuses,
  deleteCynologistSlots,
  createMissingCynologistSlots,
  blockCynologistExceptionOverlap,
  readPublicSlotCynologist,
  readTrainerSlotCynologist,
  readFreeCynologistSlots,
  readCalendarCynologistSlots,
  readVerifiedConsultationSlot,
} from "./slotRows";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  dayOffs: vi.fn(),
  latest: vi.fn(),
  ruleCount: vi.fn(),
  execute: vi.fn(),
  schedule: vi.fn(),
  existing: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  cyn: vi.fn(),
  slots: vi.fn(),
  verify: vi.fn(),
}));
const tx = {
  $executeRaw: db.execute,
  consultationCynologist: { findUnique: db.schedule },
  consultationSlot: {
    findMany: db.existing,
    updateMany: db.update,
    deleteMany: db.remove,
    createMany: db.create,
  },
};
vi.mock("@gafus/prisma", () => ({
  Prisma: {
    sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ fragments: [...parts], values }),
  },
  prisma: {
    $transaction: db.transaction,
    consultationDayOff: { findMany: db.dayOffs },
    consultationAvailabilityRule: { count: db.ruleCount },
    consultationCynologist: { findUnique: db.cyn },
    consultationSlot: {
      findFirst: (input: unknown) => {
        const query = input as { where: { id?: string } };
        return "id" in query.where ? db.verify(input) : db.latest(input);
      },
      findMany: db.slots,
    },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (fn) => fn(tx));
  db.execute.mockResolvedValue(1);
});
const active = ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"] as const;
const from = new Date("2026-11-20T00:00:00Z");
const to = new Date("2026-11-27T00:00:00Z");

describe("Consultation calendar SQL port", () => {
  it("executes an explicitly bounded transaction and keeps locks in its own tx", async () => {
    await withSlotTransaction(
      async (client) => {
        await lockCynologistSlotHorizon(client, "cyn-1");
        await readCynologistSlotSchedule(client, "cyn-1");
        await readExistingCynologistSlots(client, "cyn-1", from, to, active);
      },
      { maxWait: 10000, timeout: 120000 },
    );
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10000,
      timeout: 120000,
    });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.schedule).toHaveBeenCalledWith({
      where: { id: "cyn-1" },
      include: { availabilityRules: true, dayOffs: true, slotExceptions: true },
    });
    expect(db.existing).toHaveBeenCalledWith({
      where: { cynologistId: "cyn-1", startAt: { lt: to }, endAt: { gt: from } },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        bookings: { where: { status: { in: [...active] } }, select: { id: true }, take: 1 },
        _count: { select: { bookings: true } },
      },
    });
  });
  it("applies status changes in batches, preserves history and upserts only genuinely missing slots", async () => {
    await updateCynologistSlotStatuses(tx, ["slot-1", "slot-2"], "BLOCKED");
    await deleteCynologistSlots(tx, ["slot-3"]);
    await createMissingCynologistSlots(tx, "cyn-1", [{ startAt: from, endAt: to }]);
    await blockCynologistExceptionOverlap(tx, "cyn-1", from, to);
    expect(db.update).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["slot-1", "slot-2"] } },
      data: { status: "BLOCKED" },
    });
    expect(db.create).toHaveBeenCalledWith({
      data: [{ cynologistId: "cyn-1", startAt: from, endAt: to, status: "FREE" }],
      skipDuplicates: true,
    });
    expect(db.update).toHaveBeenNthCalledWith(2, {
      where: {
        cynologistId: "cyn-1",
        status: "FREE",
        startAt: { lt: to },
        endAt: { gt: from },
      },
      data: { status: "BLOCKED" },
    });
  });
  it("prevents active-booking and other-trainer leaks in available and calendar reads", async () => {
    await readFreeCynologistSlots("cyn-1", from, to, active);
    await readCalendarCynologistSlots("cyn-1", from, to, active);
    await readVerifiedConsultationSlot("slot-1", "trainer-1", active);
    const free = db.slots.mock.calls[0]![0];
    expect(free.where).toMatchObject({
      cynologistId: "cyn-1",
      status: "FREE",
      bookings: { none: { status: { in: [...active] } } },
    });
    const calendar = db.slots.mock.calls[1]![0];
    expect(calendar.where.status.in).toEqual(["FREE", "BOOKED", "BLOCKED"]);
    expect(calendar.select.bookings.take).toBe(1);
    expect(db.verify.mock.calls[0]![0].where).toEqual({
      id: "slot-1",
      cynologist: { userId: "trainer-1" },
    });
  });
  it("keeps staff/cynologist projection minimal and scoped", async () => {
    await readCynologistDayOffDates("cyn-1");
    await readLatestCynologistSlot("cyn-1");
    await countCynologistWorkingRules("cyn-1");
    await readPublicSlotCynologist("trainer-1");
    await readTrainerSlotCynologist("trainer-1");
    expect(db.cyn).toHaveBeenNthCalledWith(2, {
      where: { userId: "trainer-1" },
      select: { id: true, slotHorizonDays: true },
    });
    expect(db.ruleCount).toHaveBeenCalledWith({
      where: { cynologistId: "cyn-1", isWorkingDay: true },
    });
  });
});

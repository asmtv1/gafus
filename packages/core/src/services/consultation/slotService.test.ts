import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as GafusPrisma from "@gafus/prisma";

import { ConsultationSlotStatus } from "@gafus/prisma";

import { ConsultationNotFoundError } from "./errors";

const {
  cynologistFindUnique,
  slotFindMany,
  slotFindFirst,
  dayOffFindMany,
  availabilityRuleCount,
  prismaTransaction,
  txSlotFindMany,
  txSlotFindFirst,
  txSlotCreate,
  txSlotCreateMany,
  txSlotUpdate,
  txSlotDelete,
  txSlotDeleteMany,
  txSlotUpdateMany,
  txExecuteRaw,
} = vi.hoisted(() => ({
  cynologistFindUnique: vi.fn(),
  slotFindMany: vi.fn(),
  slotFindFirst: vi.fn(),
  dayOffFindMany: vi.fn(),
  availabilityRuleCount: vi.fn(),
  prismaTransaction: vi.fn(),
  txSlotFindMany: vi.fn(),
  txSlotFindFirst: vi.fn(),
  txSlotCreate: vi.fn(),
  txSlotCreateMany: vi.fn(),
  txSlotUpdate: vi.fn(),
  txSlotDelete: vi.fn(),
  txSlotDeleteMany: vi.fn(),
  txSlotUpdateMany: vi.fn(),
  txExecuteRaw: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/prisma", async (importOriginal) => {
  const mod = await importOriginal<typeof GafusPrisma>();
  return {
    ...mod,
    prisma: {
      ...mod.prisma,
      $transaction: prismaTransaction,
      consultationCynologist: {
        ...mod.prisma.consultationCynologist,
        findUnique: cynologistFindUnique,
      },
      consultationSlot: {
        ...mod.prisma.consultationSlot,
        findMany: slotFindMany,
        findFirst: slotFindFirst,
      },
      consultationDayOff: {
        ...mod.prisma.consultationDayOff,
        findMany: dayOffFindMany,
      },
      consultationAvailabilityRule: {
        ...mod.prisma.consultationAvailabilityRule,
        count: availabilityRuleCount,
      },
    },
  };
});

describe("getAvailableSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dayOffFindMany.mockResolvedValue([]);
    slotFindFirst.mockResolvedValue(null);
    availabilityRuleCount.mockResolvedValue(0);
    txSlotFindMany.mockResolvedValue([]);
    txSlotFindFirst.mockResolvedValue(null);
    txSlotCreate.mockResolvedValue({});
    txSlotCreateMany.mockResolvedValue({ count: 0 });
    txSlotUpdate.mockResolvedValue({});
    txSlotDelete.mockResolvedValue({});
    txSlotDeleteMany.mockResolvedValue({ count: 0 });
    txSlotUpdateMany.mockResolvedValue({ count: 0 });
    prismaTransaction.mockImplementation(async (fn) =>
      fn({
        $executeRaw: txExecuteRaw,
        consultationCynologist: { findUnique: cynologistFindUnique },
        consultationSlot: {
          findMany: txSlotFindMany,
          findFirst: txSlotFindFirst,
          create: txSlotCreate,
          createMany: txSlotCreateMany,
          update: txSlotUpdate,
          delete: txSlotDelete,
          deleteMany: txSlotDeleteMany,
          updateMany: txSlotUpdateMany,
        },
      }),
    );
  });

  it("бросает ConsultationNotFoundError, если кинолог не найден", async () => {
    cynologistFindUnique.mockResolvedValue(null);
    const { getAvailableSlots } = await import("./slotService");
    await expect(getAvailableSlots("user-missing", new Date(), new Date())).rejects.toBeInstanceOf(
      ConsultationNotFoundError,
    );
    expect(slotFindMany).not.toHaveBeenCalled();
  });

  it("возвращает FREE-слоты с учётом lead time", async () => {
    const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const from = new Date(Date.now());
    const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    cynologistFindUnique.mockResolvedValue({
      id: "cy1",
      bookingLeadTimeMin: 60,
    });
    slotFindMany.mockResolvedValue([
      {
        id: "sl1",
        startAt: futureStart,
        endAt: futureEnd,
        status: ConsultationSlotStatus.FREE,
      },
    ]);
    const { getAvailableSlots } = await import("./slotService");
    const out = await getAvailableSlots("user-1", from, to);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("sl1");
    expect(out[0]?.status).toBe(ConsultationSlotStatus.FREE);
  });

  it("getCalendarSlots: FREE + отменённая бронь остаётся FREE, не маскируется под BOOKED", async () => {
    const from = new Date(Date.now());
    const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const futureStart = new Date(Date.now() + 50 * 60 * 60 * 1000);
    const futureEnd = new Date(Date.now() + 50 * 60 * 60 * 1000 + 30 * 60 * 1000);
    cynologistFindUnique.mockResolvedValue({
      id: "cy1",
      bookingLeadTimeMin: 0,
    });
    slotFindMany.mockResolvedValue([
      {
        id: "sl-cancelled",
        startAt: futureStart,
        endAt: futureEnd,
        status: ConsultationSlotStatus.FREE,
        // В БД может быть отменённая бронь; в выборку попадают только активные.
        bookings: [],
      },
    ]);
    const { getCalendarSlots } = await import("./slotService");
    const out = await getCalendarSlots("user-1", from, to);
    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe(ConsultationSlotStatus.FREE);
  });

  it("preserves cancelled-booking history but BLOCKS a slot removed by schedule edit", async () => {
    cynologistFindUnique.mockResolvedValue({
      id: "cy1",
      slotDurationMin: 30,
      availabilityRules: [],
      dayOffs: [],
      slotExceptions: [],
    });
    txSlotFindMany.mockResolvedValue([
      {
        id: "slot-historical",
        startAt: new Date("2026-10-26T07:00:00Z"),
        endAt: new Date("2026-10-26T07:30:00Z"),
        status: "FREE",
        bookings: [],
        _count: { bookings: 1 },
      },
    ]);
    const { rebuildSlotsForCynologist } = await import("./slotService");
    await rebuildSlotsForCynologist(
      "cy1",
      new Date("2026-10-26T00:00:00Z"),
      new Date("2026-10-27T00:00:00Z"),
    );
    expect(txSlotUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["slot-historical"] } },
      data: { status: "BLOCKED" },
    });
    expect(txSlotDeleteMany).not.toHaveBeenCalled();
  });

  it("restores a historical BLOCKED slot only when new weekly rules permit it", async () => {
    cynologistFindUnique.mockResolvedValue({
      id: "cy1",
      slotDurationMin: 30,
      availabilityRules: [{ weekday: 1, startTime: "10:00", endTime: "10:30", isWorkingDay: true }],
      dayOffs: [],
      slotExceptions: [],
    });
    txSlotFindMany.mockResolvedValue([
      {
        id: "slot-historical",
        startAt: new Date("2026-10-26T07:00:00Z"),
        endAt: new Date("2026-10-26T07:30:00Z"),
        status: "BLOCKED",
        bookings: [],
        _count: { bookings: 1 },
      },
    ]);
    txSlotFindFirst.mockResolvedValue({ id: "slot-historical" });
    const { rebuildSlotsForCynologist } = await import("./slotService");
    await rebuildSlotsForCynologist(
      "cy1",
      new Date("2026-10-26T00:00:00Z"),
      new Date("2026-10-27T00:00:00Z"),
    );
    expect(txSlotUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["slot-historical"] } },
      data: { status: "FREE" },
    });
    expect(txSlotDeleteMany).not.toHaveBeenCalled();
  });

  it("getCalendarSlots пересобирает протухший горизонт перед чтением", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T00:00:00.000Z"));
    const from = new Date("2026-06-29T21:00:00.000Z");
    const to = new Date("2026-07-14T20:59:59.999Z");
    const rebuiltStart = new Date("2026-06-30T07:00:00.000Z");
    const rebuiltEnd = new Date("2026-06-30T07:30:00.000Z");

    cynologistFindUnique
      .mockResolvedValueOnce({
        id: "cy1",
        bookingLeadTimeMin: 0,
        slotHorizonDays: 60,
      })
      .mockResolvedValueOnce({
        id: "cy1",
        slotDurationMin: 30,
        availabilityRules: [
          {
            weekday: 2,
            startTime: "10:00",
            endTime: "10:30",
            isWorkingDay: true,
          },
        ],
        dayOffs: [],
        slotExceptions: [],
      });
    slotFindFirst.mockResolvedValueOnce({
      startAt: new Date("2026-06-21T16:30:00.000Z"),
    });
    availabilityRuleCount.mockResolvedValueOnce(1);
    slotFindMany.mockResolvedValueOnce([
      {
        id: "sl-rebuilt",
        startAt: rebuiltStart,
        endAt: rebuiltEnd,
        status: ConsultationSlotStatus.FREE,
        bookings: [],
      },
    ]);

    const { getCalendarSlots } = await import("./slotService");
    const out = await getCalendarSlots("user-1", from, to);

    expect(prismaTransaction).toHaveBeenCalledTimes(1);
    expect(txSlotCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          cynologistId: "cy1",
          startAt: rebuiltStart,
          endAt: rebuiltEnd,
          status: ConsultationSlotStatus.FREE,
        },
      ]),
      skipDuplicates: true,
    });
    expect(txSlotCreateMany).toHaveBeenCalledTimes(1);
    expect(txSlotFindFirst).not.toHaveBeenCalled();
    expect(slotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cynologistId: "cy1" }),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("sl-rebuilt");
    vi.useRealTimers();
  });
});

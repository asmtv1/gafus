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
  txSlotUpdate,
  txSlotDelete,
  txSlotUpdateMany,
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
  txSlotUpdate: vi.fn(),
  txSlotDelete: vi.fn(),
  txSlotUpdateMany: vi.fn(),
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
    txSlotUpdate.mockResolvedValue({});
    txSlotDelete.mockResolvedValue({});
    txSlotUpdateMany.mockResolvedValue({ count: 0 });
    prismaTransaction.mockImplementation(async (fn) =>
      fn({
        consultationSlot: {
          findMany: txSlotFindMany,
          findFirst: txSlotFindFirst,
          create: txSlotCreate,
          update: txSlotUpdate,
          delete: txSlotDelete,
          updateMany: txSlotUpdateMany,
        },
      }),
    );
  });

  it("бросает ConsultationNotFoundError, если кинолог не найден", async () => {
    cynologistFindUnique.mockResolvedValue(null);
    const { getAvailableSlots } = await import("./slotService");
    await expect(
      getAvailableSlots("user-missing", new Date(), new Date()),
    ).rejects.toBeInstanceOf(ConsultationNotFoundError);
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

  it("getCalendarSlots пересобирает протухший горизонт перед чтением", async () => {
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
    expect(txSlotCreate).toHaveBeenCalledWith({
      data: {
        cynologistId: "cy1",
        startAt: rebuiltStart,
        endAt: rebuiltEnd,
        status: ConsultationSlotStatus.FREE,
      },
    });
    expect(slotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cynologistId: "cy1" }),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("sl-rebuilt");
  });
});

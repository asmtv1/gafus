import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as GafusPrisma from "@gafus/prisma";

import { ConsultationSlotStatus } from "@gafus/prisma";

import { ConsultationNotFoundError } from "./errors";

const { cynologistFindUnique, slotFindMany, dayOffFindMany } = vi.hoisted(() => ({
  cynologistFindUnique: vi.fn(),
  slotFindMany: vi.fn(),
  dayOffFindMany: vi.fn(),
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
      consultationCynologist: {
        ...mod.prisma.consultationCynologist,
        findUnique: cynologistFindUnique,
      },
      consultationSlot: {
        ...mod.prisma.consultationSlot,
        findMany: slotFindMany,
      },
      consultationDayOff: {
        ...mod.prisma.consultationDayOff,
        findMany: dayOffFindMany,
      },
    },
  };
});

describe("getAvailableSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dayOffFindMany.mockResolvedValue([]);
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
});

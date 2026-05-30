import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GafusPrisma from "@gafus/prisma";

import { ConsultationNotFoundError } from "./errors";

const { cynologistFindUnique, dayOffFindMany } = vi.hoisted(() => ({
  cynologistFindUnique: vi.fn(),
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
      consultationDayOff: {
        ...mod.prisma.consultationDayOff,
        findMany: dayOffFindMany,
      },
    },
  };
});

describe("getCynologistDayOffDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("бросает ConsultationNotFoundError, если кинолог не найден", async () => {
    cynologistFindUnique.mockResolvedValue(null);
    const { getCynologistDayOffDates } = await import("./availabilityService");
    await expect(
      getCynologistDayOffDates(
        "missing",
        new Date("2026-04-01T00:00:00.000Z"),
        new Date("2026-04-30T23:59:59.999Z"),
      ),
    ).rejects.toBeInstanceOf(ConsultationNotFoundError);
  });

  it("возвращает dayOff даты в ключах МСК", async () => {
    cynologistFindUnique.mockResolvedValue({ id: "cy1" });
    dayOffFindMany.mockResolvedValue([
      { date: new Date("2026-04-30T21:00:00.000Z") },
    ]);
    const { getCynologistDayOffDates } = await import("./availabilityService");
    const out = await getCynologistDayOffDates(
      "user1",
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-05-31T23:59:59.999Z"),
    );
    expect(out).toEqual(["2026-05-01"]);
  });
});

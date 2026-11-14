import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConsultationAvailabilityService } from "./availabilityService";
import { ConsultationNotFoundError } from "./errors";

const readCynologistDayOffDates = vi.fn();
const { getCynologistDayOffDates } = createConsultationAvailabilityService({
  ensureConsultationCynologistRow: vi.fn(),
  readTrainerSchedule: vi.fn(),
  applyScheduleChange: vi.fn(),
  readCynologistDayOffDates,
  hasTrainerScheduleOwnership: vi.fn(),
});

describe("getCynologistDayOffDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("бросает ConsultationNotFoundError, если кинолог не найден", async () => {
    readCynologistDayOffDates.mockResolvedValue(null);
    await expect(
      getCynologistDayOffDates(
        "missing",
        new Date("2026-04-01T00:00:00.000Z"),
        new Date("2026-04-30T23:59:59.999Z"),
      ),
    ).rejects.toBeInstanceOf(ConsultationNotFoundError);
  });

  it("возвращает dayOff даты в ключах МСК", async () => {
    readCynologistDayOffDates.mockResolvedValue([new Date("2026-04-30T21:00:00.000Z")]);
    const out = await getCynologistDayOffDates(
      "user1",
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-05-31T23:59:59.999Z"),
    );
    expect(out).toEqual(["2026-05-01"]);
  });
});

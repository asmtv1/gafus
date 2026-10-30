import { describe, expect, it } from "vitest";
import {
  editableScheduleRangeMsk,
  editableScheduleDaysMsk,
  groupEditableSlotsByMskDay,
  readableSlotMsk,
} from "./consultationScheduleTime";

describe("Next consultation calendar parity, timezone-independent", () => {
  it("starts at Moscow midnight and ends 14 days later, even when UTC date differs", () => {
    const range = editableScheduleRangeMsk(new Date("2026-10-25T22:30:00.000Z"));
    expect(range.firstDayKey).toBe("2026-10-26");
    expect(range.lastDayKey).toBe("2026-11-09");
    expect(range.fromUtc).toBe("2026-10-25T21:00:00.000Z");
    expect(range.toUtc).toBe("2026-11-09T20:59:59.999Z");
  });
  it("produces exactly fifteen calendar days including empty ones", () => {
    const days = editableScheduleDaysMsk(new Date("2026-10-25T22:30:00Z"));
    expect(days).toHaveLength(15);
    expect(days[0].date).toBe("2026-10-26");
    expect(days.at(-1)?.date).toBe("2026-11-09");
    expect(days[0].label).toContain("26");
  });
  it("groups FREE slots by Moscow date even across UTC day change", () => {
    const groups = groupEditableSlotsByMskDay([
      {
        id: "2",
        startAtUtc: "2026-10-25T21:30:00Z",
        endAtUtc: "2026-10-25T22:00:00Z",
        status: "FREE",
      },
      {
        id: "1",
        startAtUtc: "2026-10-25T19:30:00Z",
        endAtUtc: "2026-10-25T20:00:00Z",
        status: "FREE",
      },
    ]);
    expect(groups.map((group) => group.date)).toEqual(["2026-10-25", "2026-10-26"]);
    expect(groups.flatMap((group) => group.slots.map((slot) => slot.id))).toEqual(["1", "2"]);
  });
  it("formats UTC slots explicitly in Moscow timezone not browser timezone", () => {
    expect(
      readableSlotMsk({
        id: "1",
        startAtUtc: "2026-10-25T09:00:00Z",
        endAtUtc: "2026-10-25T09:30:00Z",
        status: "FREE",
      }),
    ).toContain("12:00 - 12:30 (МСК)");
  });
  it("refuses malformed, booked, and zero-length source slots", () => {
    const input = [
      { id: "bad", startAtUtc: "broken", endAtUtc: "broken", status: "FREE" },
      {
        id: "same",
        startAtUtc: "2026-10-25T10:00:00Z",
        endAtUtc: "2026-10-25T10:00:00Z",
        status: "FREE",
      },
      {
        id: "booked",
        startAtUtc: "2026-10-25T10:00:00Z",
        endAtUtc: "2026-10-25T10:30:00Z",
        status: "BOOKED",
      },
    ];
    const source = input as Parameters<typeof groupEditableSlotsByMskDay>[0];
    expect(groupEditableSlotsByMskDay(source)).toEqual([]);
  });
});

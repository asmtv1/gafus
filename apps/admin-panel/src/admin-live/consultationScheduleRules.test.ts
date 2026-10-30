import { describe, expect, it } from "vitest";
import { normalizeAdminWeeklyRules } from "./consultationScheduleRules";

describe("admin schedule editor / legacy Next weekly rule parity", () => {
  it("renders seven fixed weekdays when a trainer has no stored rules", () => {
    const rules = normalizeAdminWeeklyRules([]);
    expect(rules.map((rule) => rule.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rules.map((rule) => rule.isWorkingDay)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });
  it("preserves an existing changed weekday and fills missing days", () => {
    const rules = normalizeAdminWeeklyRules([
      { weekday: 5, startTime: "12:00", endTime: "17:00", isWorkingDay: false },
    ]);
    expect(rules).toHaveLength(7);
    expect(rules[5]).toEqual({
      weekday: 5,
      startTime: "12:00",
      endTime: "17:00",
      isWorkingDay: false,
    });
    expect(rules[1]).toEqual({
      weekday: 1,
      startTime: "09:00",
      endTime: "18:00",
      isWorkingDay: true,
    });
  });
  it("never adds an eighth weekday or invalid weekday", () => {
    const rules = normalizeAdminWeeklyRules([
      { weekday: 8, startTime: "00:00", endTime: "01:00", isWorkingDay: true },
      { weekday: 2, startTime: "08:00", endTime: "10:00", isWorkingDay: true },
    ]);
    expect(rules.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rules[2].startTime).toBe("08:00");
  });
});

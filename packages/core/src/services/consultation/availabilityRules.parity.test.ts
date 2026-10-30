import { describe, expect, it } from "vitest";
import { dayOffInputSchema, trainerAvailabilityInputSchema } from "./validation";

const rule = (weekday: number) => ({
  weekday,
  startTime: "09:00",
  endTime: "18:00",
  isWorkingDay: true,
});

describe("consultation weekly availability / Prisma weekday uniqueness", () => {
  it("accepts seven distinct weekdays in the original Next editor", () => {
    expect(
      trainerAvailabilityInputSchema.safeParse({
        rules: Array.from({ length: 7 }, (_, day) => rule(day)),
      }).success,
    ).toBe(true);
  });
  it("rejects repeated weekday before the transactional delete/reinsert", () => {
    const result = trainerAvailabilityInputSchema.safeParse({ rules: [rule(1), rule(1)] });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.some((issue) => issue.path.join(".") === "rules.1.weekday")).toBe(
        true,
      );
  });
  it("rejects more than seven rules and a midnight-crossing interval", () => {
    expect(
      trainerAvailabilityInputSchema.safeParse({
        rules: Array.from({ length: 8 }, (_, day) => rule(day % 7)),
      }).success,
    ).toBe(false);
    expect(
      trainerAvailabilityInputSchema.safeParse({
        rules: [{ weekday: 0, startTime: "23:00", endTime: "01:00", isWorkingDay: true }],
      }).success,
    ).toBe(false);
  });
});

describe("admin consultation day-off calendar dates", () => {
  it("rejects impossible dates instead of silently moving an exception", () => {
    for (const date of ["2026-02-29", "2026-02-31", "2026-04-31", "2026-13-01", "2026-00-10"]) {
      expect(dayOffInputSchema.safeParse({ date }).success).toBe(false);
    }
  });
  it("accepts a real leap day and ordinary valid dates", () => {
    expect(dayOffInputSchema.safeParse({ date: "2024-02-29" }).success).toBe(true);
    expect(dayOffInputSchema.safeParse({ date: "2026-10-25" }).success).toBe(true);
  });
});

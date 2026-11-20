import { describe, expect, it } from "vitest";
import { TrainingStatus as S } from "@gafus/types/training-client";
import {
  calculateDayStatus,
  calculateCourseStatus,
  calculateCourseStatusFromDayStatuses,
} from "./training";

describe("training.complete.canonical — owning browser-safe implementation", () => {
  it("incomplete second step never completes a day", () => {
    const states = { "course-day-0": { status: S.COMPLETED } };
    expect(calculateDayStatus("course", "day", states, 2)).toBe(S.IN_PROGRESS);
    expect(calculateDayStatus("course", "day", states, 1)).toBe(S.COMPLETED);
  });

  it("uses explicit day IDs with hyphens and requires all course days", () => {
    const states = {
      "course-v2-day-one-0": { status: S.COMPLETED },
      "course-v2-day-two-0": { status: S.COMPLETED },
    };
    expect(calculateCourseStatus("course-v2", states, 2, ["day-one", "day-two"]))
      .toBe(S.COMPLETED);
    expect(calculateCourseStatus("course-v2", states, 3, ["day-one", "day-two"]))
      .toBe(S.IN_PROGRESS);
  });

  it("empty course is not completed, even when expected total is zero", () => {
    expect(calculateCourseStatusFromDayStatuses([], 0)).toBe(S.NOT_STARTED);
  });

  it("only exact completed day count ends course; pending and reset stay distinct", () => {
    expect(calculateCourseStatusFromDayStatuses([S.COMPLETED, S.COMPLETED], 2)).toBe(S.COMPLETED);
    expect(calculateCourseStatusFromDayStatuses([S.COMPLETED], 2)).toBe(S.IN_PROGRESS);
    expect(calculateCourseStatusFromDayStatuses([S.RESET], 1)).toBe(S.RESET);
  });
});

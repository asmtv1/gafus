import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  calculateCurrentStreak,
  calculateLongestStreak,
} from "./calculateStreaks";

describe("calculateCurrentStreak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for empty array", () => {
    expect(calculateCurrentStreak([])).toBe(0);
  });

  it("returns 1 when only today", () => {
    vi.setSystemTime(new Date("2025-03-15T12:00:00"));
    const dates = [new Date("2025-03-15T10:00:00")];
    expect(calculateCurrentStreak(dates)).toBe(1);
  });

  it("returns 2 for today + yesterday", () => {
    vi.setSystemTime(new Date("2025-03-15"));
    const dates = [new Date("2025-03-15"), new Date("2025-03-14")];
    expect(calculateCurrentStreak(dates)).toBe(2);
  });

  it("returns 3 for today + yesterday + day before", () => {
    vi.setSystemTime(new Date("2025-03-15"));
    const dates = [
      new Date("2025-03-15"),
      new Date("2025-03-14"),
      new Date("2025-03-13"),
    ];
    expect(calculateCurrentStreak(dates)).toBe(3);
  });

  it("returns 0 when last activity 2 days ago", () => {
    vi.setSystemTime(new Date("2025-03-15"));
    const dates = [new Date("2025-03-13")];
    expect(calculateCurrentStreak(dates)).toBe(0);
  });

  it("accepts string dates", () => {
    vi.setSystemTime(new Date("2025-03-15"));
    const dates = ["2025-03-15", "2025-03-14"];
    expect(calculateCurrentStreak(dates)).toBe(2);
  });

  it("ignores invalid date strings", () => {
    vi.setSystemTime(new Date("2025-03-15"));
    const dates = ["2025-03-15", "invalid-date"];
    expect(calculateCurrentStreak(dates)).toBe(1);
  });

  it("counts duplicate dates as one day", () => {
    vi.setSystemTime(new Date("2025-03-15"));
    const dates = [
      new Date("2025-03-15T09:00:00"),
      new Date("2025-03-15T18:00:00"),
    ];
    expect(calculateCurrentStreak(dates)).toBe(1);
  });
});

describe("calculateLongestStreak", () => {
  it("returns 0 for empty array", () => {
    expect(calculateLongestStreak([])).toBe(0);
  });

  it("returns 1 for single date", () => {
    const dates = [new Date("2025-03-15")];
    expect(calculateLongestStreak(dates)).toBe(1);
  });

  it("returns 3 for three consecutive dates", () => {
    const dates = [
      new Date("2025-03-13"),
      new Date("2025-03-14"),
      new Date("2025-03-15"),
    ];
    expect(calculateLongestStreak(dates)).toBe(3);
  });

  it("returns 5 for two streaks 3 and 5 (longest wins)", () => {
    const dates = [
      new Date("2025-03-01"),
      new Date("2025-03-02"),
      new Date("2025-03-03"),
      new Date("2025-03-05"),
      new Date("2025-03-06"),
      new Date("2025-03-07"),
      new Date("2025-03-08"),
      new Date("2025-03-09"),
    ];
    expect(calculateLongestStreak(dates)).toBe(5);
  });

  it("returns 1 when all same date", () => {
    const dates = [
      new Date("2025-03-15"),
      new Date("2025-03-15"),
      new Date("2025-03-15"),
    ];
    expect(calculateLongestStreak(dates)).toBe(1);
  });

  it("returns 1 for non-consecutive dates", () => {
    const dates = [
      new Date("2025-03-10"),
      new Date("2025-03-12"),
      new Date("2025-03-14"),
    ];
    expect(calculateLongestStreak(dates)).toBe(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateCurrentStreak, calculateLongestStreak } from "./calculateStreaks";

afterEach(() => vi.useRealTimers());

describe("achievement streaks: pure day-level arithmetic", () => {
  it("reports zero for empty or invalid activity and does not invent a current streak", () => {
    expect(calculateCurrentStreak([])).toBe(0);
    expect(calculateLongestStreak([])).toBe(0);
    expect(calculateCurrentStreak(["invalid"])).toBe(0);
    expect(calculateLongestStreak(["invalid"])).toBe(0);
  });

  it("recognizes current and longest streaks with duplicate days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0));
    const dates = [
      new Date(2026, 9, 30, 9, 12),
      new Date(2026, 9, 29, 17, 20),
      new Date(2026, 9, 28, 11, 45),
      new Date(2026, 9, 29, 10, 0),
      new Date(2026, 9, 20, 12, 0),
    ];
    expect(calculateCurrentStreak(dates)).toBe(3);
    expect(calculateLongestStreak(dates)).toBe(3);
  });

  it("never modifies caller-owned Date instances during normalization", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0));
    const dates = [new Date(2026, 9, 30, 17, 43), new Date(2026, 9, 29, 15, 17)];
    const snapshots = dates.map(d => d.getTime());
    expect(calculateCurrentStreak(dates)).toBe(2);
    expect(calculateLongestStreak(dates)).toBe(2);
    expect(dates.map(d => d.getTime())).toEqual(snapshots);
  });

  it("does not count stale historical streak as active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0));
    const dates = [new Date(2026, 9, 20), new Date(2026, 9, 19)];
    expect(calculateCurrentStreak(dates)).toBe(0);
    expect(calculateLongestStreak(dates)).toBe(2);
  });
});

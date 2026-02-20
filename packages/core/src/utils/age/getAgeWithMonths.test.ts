import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getAgeWithMonths } from "./getAgeWithMonths";

describe("getAgeWithMonths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns { years: 0, months: 0 } for same date", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAgeWithMonths("2025-06-15")).toEqual({ years: 0, months: 0 });
  });

  it("returns { years: 0, months: 6 } for 6 months ago", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAgeWithMonths("2024-12-15")).toEqual({ years: 0, months: 6 });
  });

  it("returns { years: 1, months: 3 } for 1 year 3 months ago", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAgeWithMonths("2024-03-15")).toEqual({ years: 1, months: 3 });
  });

  it("handles month correction when current month is before birth month", () => {
    vi.setSystemTime(new Date("2025-03-15")); // March
    expect(getAgeWithMonths("2024-06-15")).toEqual({ years: 0, months: 9 });
  });
});

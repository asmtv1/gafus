import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getAge } from "./getAge";

describe("getAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 35 when birthday is today", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAge("1990-06-15")).toBe(35);
  });

  it("returns 34 when birthday is tomorrow", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAge("1990-06-16")).toBe(34);
  });

  it("returns 35 when birthday was yesterday", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAge("1990-06-14")).toBe(35);
  });

  it("returns 0 for birth today", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAge("2025-06-15")).toBe(0);
  });

  it("handles Date input", () => {
    vi.setSystemTime(new Date("2025-06-15"));
    expect(getAge(new Date("1990-06-15"))).toBe(35);
  });
});

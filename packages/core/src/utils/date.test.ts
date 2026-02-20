import { describe, expect, it } from "vitest";

import { formatDate } from "./date";

describe("formatDate", () => {
  it("formats Date as DD.MM.YYYY with leading zeros", () => {
    expect(formatDate(new Date("2024-01-09"))).toBe("09.01.2024");
  });

  it("formats Date with single-digit day and month", () => {
    expect(formatDate(new Date("2024-11-01"))).toBe("01.11.2024");
  });

  it("formats end of year", () => {
    expect(formatDate(new Date("2024-12-31"))).toBe("31.12.2024");
  });

  it("handles string input", () => {
    expect(formatDate("2024-01-09")).toBe("09.01.2024");
  });
});

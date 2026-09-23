import { describe, expect, it } from "vitest";

import {
  getDefaultMobileIntroDateRange,
  parseMobileIntroDateRange,
  samaraDayStart,
} from "./dateRange";

describe("mobile intro date range", () => {
  it("uses the last 30 inclusive calendar days in Samara by default", () => {
    const range = getDefaultMobileIntroDateRange(new Date("2026-09-17T21:30:00.000Z"));

    expect(range.startDate).toBe("2026-08-20");
    expect(range.endDate).toBe("2026-09-18");
    expect(range.start.toISOString()).toBe("2026-08-19T20:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-18T20:00:00.000Z");
  });

  it("turns inclusive Samara dates into a half-open UTC interval", () => {
    const range = parseMobileIntroDateRange("2026-09-01", "2026-09-17");

    expect(range.start.toISOString()).toBe("2026-08-31T20:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-17T20:00:00.000Z");
  });

  it("falls back to the default range for an invalid or inverted URL range", () => {
    const now = new Date("2026-09-17T12:00:00.000Z");

    expect(parseMobileIntroDateRange("2026-09-18", "2026-09-17", now)).toEqual(
      getDefaultMobileIntroDateRange(now),
    );
    expect(parseMobileIntroDateRange("2026-02-30", "2026-03-01", now)).toEqual(
      getDefaultMobileIntroDateRange(now),
    );
  });

  it("rejects malformed dates before creating a range", () => {
    expect(() => samaraDayStart("17.09.2026")).toThrow("Некорректная дата");
  });
});

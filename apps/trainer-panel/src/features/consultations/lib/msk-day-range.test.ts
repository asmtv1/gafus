import { describe, expect, it } from "vitest";

import {
  addDaysToIsoDayKey,
  enumerateIsoDayKeysInclusive,
  moscowDayRangeToUtcBounds,
  utcInstantToMoscowDayKey,
} from "./msk-day-range";

describe("trainer consultation Moscow day helpers", () => {
  it("adds calendar days without local timezone drift", () => {
    expect(addDaysToIsoDayKey("2026-05-24", 1)).toBe("2026-05-25");
    expect(addDaysToIsoDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("enumerates inclusive day ranges and rejects reversed ranges", () => {
    expect(enumerateIsoDayKeysInclusive("2026-05-24", "2026-05-26")).toEqual([
      "2026-05-24",
      "2026-05-25",
      "2026-05-26",
    ]);
    expect(enumerateIsoDayKeysInclusive("2026-05-26", "2026-05-24")).toEqual([]);
  });

  it("builds UTC bounds for Moscow calendar days", () => {
    const bounds = moscowDayRangeToUtcBounds("2026-05-24", "2026-05-24");

    expect(bounds.fromUtc.toISOString()).toBe("2026-05-23T21:00:00.000Z");
    expect(bounds.toUtc.toISOString()).toBe("2026-05-24T20:59:59.999Z");
  });

  it("maps UTC instants to the correct Moscow day", () => {
    expect(utcInstantToMoscowDayKey("2026-05-23T21:30:00.000Z")).toBe("2026-05-24");
  });
});

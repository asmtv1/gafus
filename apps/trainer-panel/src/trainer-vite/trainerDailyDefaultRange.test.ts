import { describe, expect, it } from "vitest";
import { initialDailyCalendarFrom, moscowDateKey } from "./trainerDailyDefaultRange";

describe("Next daily-course Moscow date URL semantics", () => {
  it("uses Moscow date even when the UTC day differs", () => {
    const now = new Date("2026-10-25T22:30:00.000Z");
    expect(moscowDateKey(now)).toBe("2026-10-26");
    expect(initialDailyCalendarFrom(undefined, undefined, now)).toBe("2026-10-26");
  });
  it("respects valid from URL then injected mock; rejects rollover, invalid, and stale hardcode", () => {
    const now = new Date("2026-10-25T12:00:00.000Z");
    expect(initialDailyCalendarFrom("?from=2026-11-04", "2026-09-01", now)).toBe("2026-11-04");
    expect(initialDailyCalendarFrom("?from=2026-02-30", "2026-09-01", now)).toBe("2026-09-01");
    expect(initialDailyCalendarFrom("?from=not-date", undefined, now)).toBe("2026-10-25");
  });
});

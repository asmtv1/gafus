import { describe, expect, it } from "vitest";

import {
  consultationBookingCalendarWindowMsk,
  consultationMskDayKey,
  formatConsultationConfirmSlotMsk,
  formatConsultationListDateTimeMsk,
} from "./consultationMskFormat";
import { buildConsultationCalendarRangeDays } from "./consultationSlotsPresentation";

describe("formatConsultationListDateTimeMsk", () => {
  it("возвращает тире при невалидной дате", () => {
    expect(formatConsultationListDateTimeMsk("not-a-date")).toBe("—");
  });
});

describe("formatConsultationConfirmSlotMsk", () => {
  it("возвращает запасной текст при невалидных ISO", () => {
    expect(formatConsultationConfirmSlotMsk("invalid", "invalid")).toBe(
      "Время будет подтверждено при бронировании",
    );
  });
});

describe("consultationBookingCalendarWindowMsk", () => {
  it("всегда стартует с завтрашнего дня по МСК", () => {
    const now = new Date("2026-04-23T08:00:00+09:00");
    const window = consultationBookingCalendarWindowMsk(14, now);

    expect(window.fromKey).toBe("2026-04-24");
    expect(window.toKey).toBe("2026-05-08");
  });

  it("не зависит от локальной таймзоны устройства для одного и того же момента времени", () => {
    const sameInstantA = new Date("2026-04-23T03:30:00.000Z");
    const sameInstantB = new Date("2026-04-23T12:30:00+09:00");

    const a = consultationBookingCalendarWindowMsk(14, sameInstantA);
    const b = consultationBookingCalendarWindowMsk(14, sameInstantB);

    expect(a.fromKey).toBe("2026-04-24");
    expect(b.fromKey).toBe("2026-04-24");
    expect(a.toKey).toBe("2026-05-08");
    expect(b.toKey).toBe("2026-05-08");
  });
});

describe("buildConsultationCalendarRangeDays", () => {
  it("строит диапазон только от завтра по МСК и не включает предыдущий день", () => {
    const now = new Date("2026-04-23T23:50:00+03:00");
    const window = consultationBookingCalendarWindowMsk(14, now);
    const days = buildConsultationCalendarRangeDays(window.fromUtc, window.toUtc);
    const keys = days.map((d) => consultationMskDayKey(d));

    expect(keys[0]).toBe("2026-04-24");
    expect(keys).not.toContain("2026-04-23");
    expect(keys.at(-1)).toBe("2026-05-08");
    expect(keys).toHaveLength(15);
  });
});

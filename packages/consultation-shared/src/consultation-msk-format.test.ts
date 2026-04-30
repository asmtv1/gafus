import { describe, expect, it } from "vitest";

import {
  consultationBookingCalendarWindowMsk,
  consultationCalendarMonthKeyFromDayKey,
  consultationMskDayKey,
  formatConsultationConfirmSlotMsk,
} from "./consultation-msk-format";

describe("consultation-msk-format", () => {
  it("корректно считает окно календаря от завтра", () => {
    const now = new Date("2026-01-10T10:00:00Z");
    const window = consultationBookingCalendarWindowMsk(14, now);
    expect(window.fromKey).toBe("2026-01-11");
    expect(window.toKey).toBe("2026-01-25");
  });

  it("форматирует диапазон слота для экрана подтверждения", () => {
    const label = formatConsultationConfirmSlotMsk(
      "2026-01-10T07:00:00.000Z",
      "2026-01-10T07:30:00.000Z",
    );
    expect(label).toContain("10");
    expect(label).toContain("МСК");
  });

  it("строит ключ дня в МСК", () => {
    const dayKey = consultationMskDayKey(new Date("2026-01-10T21:10:00.000Z"));
    expect(dayKey).toBe("2026-01-11");
  });

  it("корректно вычисляет ключ месяца из dayKey без timezone-сдвига", () => {
    expect(consultationCalendarMonthKeyFromDayKey("2026-05-01")).toBe("2026-05");
  });

  it("безопасно обрабатывает невалидный dayKey", () => {
    expect(consultationCalendarMonthKeyFromDayKey("invalid")).toBe("invalid");
  });
});

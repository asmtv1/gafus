import { describe, expect, it } from "vitest";

import { formatConsultationConfirmSlotMsk, formatConsultationListDateTimeMsk } from "./consultationMskFormat";

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

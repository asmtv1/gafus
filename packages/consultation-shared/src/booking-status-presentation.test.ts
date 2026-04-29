import { describe, expect, it } from "vitest";

import { getConsultationBookingStatusPresentation } from "./booking-status-presentation";

describe("getConsultationBookingStatusPresentation", () => {
  it("возвращает pending для ожидания подтверждения", () => {
    const result = getConsultationBookingStatusPresentation("PENDING_TRAINER_CONFIRMATION");
    expect(result.tone).toBe("pending");
    expect(result.badge).toBe("Ожидает подтверждения");
  });

  it("прокидывает trim cancelReason для отмены тренером", () => {
    const result = getConsultationBookingStatusPresentation("CANCELLED_BY_TRAINER", {
      cancelReason: "  не могу в это время  ",
    });
    expect(result.tone).toBe("danger");
    expect(result.cancelReason).toBe("не могу в это время");
  });
});

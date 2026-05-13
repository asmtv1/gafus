import { describe, expect, it } from "vitest";

import {
  getConsultationBookingStatusGroup,
  getConsultationBookingStatusPresentation,
  isConsultationCancelledStatus,
} from "./booking-status-presentation";

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

  it("корректно группирует статусы", () => {
    expect(getConsultationBookingStatusGroup("PENDING_TRAINER_CONFIRMATION")).toBe("PENDING");
    expect(getConsultationBookingStatusGroup("CONFIRMED")).toBe("CONFIRMED");
    expect(getConsultationBookingStatusGroup("COMPLETED")).toBe("COMPLETED");
    expect(getConsultationBookingStatusGroup("NO_SHOW")).toBe("NO_SHOW");
    expect(getConsultationBookingStatusGroup("CANCELLED_BY_SYSTEM")).toBe("CANCELLED");
  });

  it("считает только CANCELLED_* как отменённые", () => {
    expect(isConsultationCancelledStatus("CANCELLED_BY_TRAINER")).toBe(true);
    expect(isConsultationCancelledStatus("CANCELLED_BY_USER")).toBe(true);
    expect(isConsultationCancelledStatus("CANCELLED_BY_SLA")).toBe(true);
    expect(isConsultationCancelledStatus("CANCELLED_BY_SYSTEM")).toBe(true);
    expect(isConsultationCancelledStatus("NO_SHOW")).toBe(false);
    expect(isConsultationCancelledStatus("COMPLETED")).toBe(false);
  });
});

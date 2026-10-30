/** AG1 booking JSON wire fixtures shared with AG3, no server DB needed. */
import { describe, expect, it } from "vitest";
import type { ConsultationBookingDto, BookSlotResult } from "@gafus/consultation-shared";
import { bookSlotInputSchema, bookSlotResultSchema } from "./validation";

const mobileBookInput = {
  slotId: "slot-1",
  idempotencyKey: "2bc12ef8-8baf-4977-9101-6ac5407957d2",
  clientOwnerName: "Анна", clientPhone: "+79990000000", petName: "Бим",
  petGender: "MALE" as const, petAge: "2 года", petBreed: "Корги",
  clientProblem: "Тянет поводок", clientSelfHelpAttempt: "Пробовали лакомства",
};
const booking: ConsultationBookingDto = {
  id: "booking-1", status: "PENDING_TRAINER_CONFIRMATION",
  slot: {
    id: "slot-1", startAtUtc: "2026-11-01T07:00:00.000Z",
    endAtUtc: "2026-11-01T08:00:00.000Z", status: "BOOKED",
  },
  cynologistUserId: "trainer-A", cynologistDisplayName: "Кинолог",
  clientUsername: "client-A", clientOwnerName: "Анна",
  clientPhone: "+79990000000", petName: "Бим", petGender: "MALE",
  petAge: "2 года", petBreed: "Корги", clientProblem: "Тянет поводок",
  clientSelfHelpAttempt: "Пробовали лакомства", cancelReason: null,
  confirmationDeadlineAt: "2026-10-31T20:00:00.000Z",
  createdAt: "2026-10-16T00:00:00.000Z",
};

describe("G1 shared consultation booking wire DTO for Mobile/Web", () => {
  it("accepts the exact AG3 native book body and preserves idempotency UUID", () => {
    expect(bookSlotInputSchema.parse(mobileBookInput)).toEqual(mobileBookInput);
  });
  it("rejects non-UUID mobile idempotency IDs before any side effect", () => {
    expect(bookSlotInputSchema.safeParse({ ...mobileBookInput, idempotencyKey: "idem-1" }).success)
      .toBe(false);
  });
  it.each(["created", "idempotent_replay"] as const)("validates %s shared persisted booking", kind => {
    const result: BookSlotResult = { kind, booking };
    expect(bookSlotResultSchema.parse(result)).toEqual(result);
  });
  it("rejects missing owner-facing booking fields for new operation", () => {
    const { slot: _slot, ...partial } = booking;
    expect(bookSlotResultSchema.safeParse({ kind: "created", booking: partial }).success)
      .toBe(false);
  });
  it("accepts older idempotent replay without optional clientUsername", () => {
    const { clientUsername: _clientUsername, ...legacyBooking } = booking;
    const result = { kind: "idempotent_replay", booking: legacyBooking };
    expect(bookSlotResultSchema.safeParse(result).success).toBe(true);
  });
});

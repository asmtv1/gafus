import { describe, expect, it } from "vitest";
import {
  bookSlotInputSchema,
  bookSlotResultSchema,
  cursorPaginationSchema,
  dayOffInputSchema,
  getSlotsQuerySchema,
  slotExceptionInputSchema,
  trainerAvailabilityInputSchema,
} from "./validation";

describe("consultation-write boundary validation (no database)", () => {
  it("rejects windows over 60 days, backwards time and malformed dates", () => {
    const from = "2026-11-01T00:00:00.000Z";
    expect(
      getSlotsQuerySchema.safeParse({
        from,
        to: "2026-12-01T00:00:00.000Z",
        includeBusy: "1",
      }).success,
    ).toBe(true);
    expect(
      getSlotsQuerySchema.safeParse({
        from,
        to: "2027-02-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(getSlotsQuerySchema.safeParse({ from, to: "2026-10-01" }).success).toBe(false);
    expect(getSlotsQuerySchema.safeParse({ from: "bogus", to: "bogus" }).success).toBe(false);
  });

  it("enforces UUID idempotency on bookings before SQL", () => {
    expect(
      bookSlotInputSchema.safeParse({ slotId: "slot_1", idempotencyKey: "same-key" }).success,
    ).toBe(false);
  });

  it("enforces one availability rule per weekday and ordered 24-hour time", () => {
    const monday = { weekday: 1, startTime: "09:00", endTime: "18:00", isWorkingDay: true };
    expect(trainerAvailabilityInputSchema.safeParse({ rules: [monday] }).success).toBe(true);
    const duplicate = trainerAvailabilityInputSchema.safeParse({ rules: [monday, monday] });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success)
      expect(
        duplicate.error.issues.some((issue) => issue.path.join(".") === "rules.1.weekday"),
      ).toBe(true);
    expect(
      trainerAvailabilityInputSchema.safeParse({
        rules: [{ ...monday, endTime: "09:00" }],
      }).success,
    ).toBe(false);
    expect(
      trainerAvailabilityInputSchema.safeParse({
        rules: [{ ...monday, startTime: "25:61" }],
      }).success,
    ).toBe(false);
  });

  it("rejects impossible calendar dates instead of normalizing them", () => {
    expect(dayOffInputSchema.safeParse({ date: "2028-02-29" }).success).toBe(true);
    expect(dayOffInputSchema.safeParse({ date: "2026-02-29" }).success).toBe(false);
    expect(dayOffInputSchema.safeParse({ date: "2026-02-31" }).success).toBe(false);
  });

  it("requires an offset and strictly ordered exception dates", () => {
    const startAt = "2026-11-11T11:00:00+03:00";
    expect(
      slotExceptionInputSchema.safeParse({
        startAt,
        endAt: "2026-11-11T12:00:00+03:00",
      }).success,
    ).toBe(true);
    expect(slotExceptionInputSchema.safeParse({ startAt, endAt: startAt }).success).toBe(false);
    expect(
      slotExceptionInputSchema.safeParse({
        startAt,
        endAt: "2026-11-11T13:00:00",
      }).success,
    ).toBe(false);
  });

  it("bounds pagination and applies the same default independently of callers", () => {
    expect(cursorPaginationSchema.parse({}).limit).toBe(20);
    expect(cursorPaginationSchema.parse({ limit: "50" }).limit).toBe(50);
    expect(cursorPaginationSchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(cursorPaginationSchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it("rejects corrupt booking replay projections (status, missing owner, forged slot)", () => {
    const booking = {
      id: "booking_1",
      status: "CONFIRMED",
      slot: {
        id: "slot_1",
        startAtUtc: "2026-11-11T11:00:00Z",
        endAtUtc: "2026-11-11T12:00:00Z",
        status: "BOOKED",
      },
      cynologistUserId: "trainer_1",
      cynologistDisplayName: "Тренер",
      clientOwnerName: null,
      clientPhone: null,
      petName: null,
      petGender: null,
      petAge: null,
      petBreed: null,
      clientProblem: null,
      clientSelfHelpAttempt: null,
      cancelReason: null,
      confirmationDeadlineAt: "2026-11-11T10:00:00Z",
      createdAt: "2026-11-10T10:00:00Z",
    };
    expect(bookSlotResultSchema.safeParse({ kind: "idempotent_replay", booking }).success).toBe(
      true,
    );
    expect(
      bookSlotResultSchema.safeParse({
        kind: "idempotent_replay",
        booking: { ...booking, status: "INJECTED" },
      }).success,
    ).toBe(false);
    expect(
      bookSlotResultSchema.safeParse({
        kind: "idempotent_replay",
        booking: { ...booking, cynologistUserId: "" },
      }).success,
    ).toBe(false);
    expect(
      bookSlotResultSchema.safeParse({
        kind: "idempotent_replay",
        booking: { ...booking, slot: { ...booking.slot, status: "PAID" } },
      }).success,
    ).toBe(false);
  });
});

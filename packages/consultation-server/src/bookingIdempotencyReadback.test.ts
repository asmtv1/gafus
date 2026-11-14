import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ receipt: vi.fn(), booking: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: {
  consultationBookingIdempotency: { findUnique: db.receipt },
  consultationBooking: { findFirst: db.booking },
} }));
import { lookupOwnConsultationBookingByKey } from "./bookingIdempotencyReadback";
const now = new Date("2026-10-17T11:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  db.receipt.mockResolvedValue({ bookingId: "booking1", responseJson: { state: "BOOKING_CREATED" },
    expiresAt: new Date("2026-10-18T00:00:00Z") });
  db.booking.mockResolvedValue({ id: "booking1", status: "CONFIRMED", slotId: "slot1",
    createdAt: new Date("2026-10-17T10:00:00Z") });
});
describe("Core owns lost-ACK consultation receipt readback", () => {
  it("reads the actor-scoped receipt and existing booking, not a foreign owner", async () => {
    const result = await lookupOwnConsultationBookingByKey("actor", "key", now);
    expect(result).toEqual({ state: "FOUND", booking: { id: "booking1",
      status: "CONFIRMED", slotId: "slot1", createdAt: "2026-10-17T10:00:00.000Z" } });
    expect(db.receipt).toHaveBeenCalledExactlyOnceWith({ where: {
      clientId_key: { clientId: "actor", key: "key" } },
      select: { bookingId: true, responseJson: true, expiresAt: true } });
    expect(db.booking).toHaveBeenCalledExactlyOnceWith({ where: {
      id: "booking1", clientId: "actor" },
      select: { id: true, status: true, slotId: true, createdAt: true } });
  });
  it("expired ledger is UNKNOWN and does not query booking", async () => {
    expect(await lookupOwnConsultationBookingByKey("actor", "key", new Date("2026-10-19")))
      .toEqual({ state: "UNKNOWN" });
    expect(db.booking).not.toHaveBeenCalled();
  });
  it("wrong / malformed response marker is UNKNOWN, never retry authorization", async () => {
    db.receipt.mockResolvedValue({ bookingId: "booking1", expiresAt: new Date("2026-10-18"),
      responseJson: { kind: "idempotent_replay", booking: { id: "another" } } });
    expect(await lookupOwnConsultationBookingByKey("actor", "key", now)).toEqual({ state: "UNKNOWN" });
    expect(db.booking).not.toHaveBeenCalled();
  });
  it("DB exception is not converted to a false UNKNOWN success", async () => {
    db.receipt.mockRejectedValue(new Error("SQL_BUSY"));
    await expect(lookupOwnConsultationBookingByKey("actor", "key", now)).rejects.toThrow("SQL_BUSY");
  });
});

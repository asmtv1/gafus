import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  receipt: vi.fn(),
  booking: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    consultationBookingIdempotency: { findUnique: m.receipt, create: m.insert },
    consultationBooking: { findFirst: m.booking, create: m.insert, update: m.update },
  },
}));
import { lookupOwnConsultationBookingByKey } from "./consultation-booking-lookup";
const key = "2bc12ef8-8baf-4977-9101-6ac5407957d2";
const now = new Date("2026-10-17T11:00:00.000Z"),
  expires = new Date("2026-10-18T11:00:00.000Z");
const owned = {
  id: "book-A",
  status: "CONFIRMED",
  slotId: "slot-A",
  createdAt: new Date("2026-10-17T10:00:00.000Z"),
  clientPhone: "PRIVATE_SENTINEL",
};
const stored = {
  bookingId: "book-A",
  expiresAt: expires,
  responseJson: { state: "BOOKING_CREATED", requestFingerprint: "SHA_SYNTHETIC" },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.receipt.mockResolvedValue(stored);
  m.booking.mockResolvedValue(owned);
});
describe("AG4 approved owner-scoped booking ledger readback (source/mock only)", () => {
  it("LR01 owner A valid transaction marker gets only minimal current state", async () => {
    const r = await lookupOwnConsultationBookingByKey("owner-A", key, now);
    expect(r).toEqual({
      state: "FOUND",
      booking: {
        id: "book-A",
        status: "CONFIRMED",
        slotId: "slot-A",
        createdAt: "2026-10-17T10:00:00.000Z",
      },
    });
    expect(m.receipt).toHaveBeenCalledWith({
      where: { clientId_key: { clientId: "owner-A", key } },
      select: { bookingId: true, responseJson: true, expiresAt: true },
    });
    expect(m.booking).toHaveBeenCalledWith({
      where: { id: "book-A", clientId: "owner-A" },
      select: { id: true, status: true, slotId: true, createdAt: true },
    });
    expect(JSON.stringify(r)).not.toContain("PRIVATE_SENTINEL");
  });
  it("LR02 foreign B same key is UNKNOWN with no booking query", async () => {
    m.receipt.mockResolvedValueOnce(null);
    expect(await lookupOwnConsultationBookingByKey("owner-B", key, now)).toEqual({
      state: "UNKNOWN",
    });
    expect(m.receipt.mock.calls[0][0].where.clientId_key.clientId).toBe("owner-B");
    expect(m.booking).not.toHaveBeenCalled();
  });
  it("LR03 unknown no ledger means no retry proof", async () => {
    m.receipt.mockResolvedValueOnce(null);
    expect(await lookupOwnConsultationBookingByKey("owner-A", key, now)).toEqual({
      state: "UNKNOWN",
    });
  });
  it("LR04 expired ledger UNKNOWN even when booking continues to exist", async () => {
    expect(await lookupOwnConsultationBookingByKey("owner-A", key, expires)).toEqual({
      state: "UNKNOWN",
    });
    expect(m.booking).not.toHaveBeenCalled();
  });
  it("LR05 dangling ledger bookingId=null means UNKNOWN", async () => {
    m.receipt.mockResolvedValueOnce({ ...stored, bookingId: null });
    expect(await lookupOwnConsultationBookingByKey("owner-A", key, now)).toEqual({
      state: "UNKNOWN",
    });
  });
  it("LR06 legacy archived created response matches bookingId", async () => {
    m.receipt.mockResolvedValueOnce({
      ...stored,
      responseJson: { kind: "created", booking: { id: "book-A", phone: "PRIVATE_SENTINEL" } },
    });
    const r = await lookupOwnConsultationBookingByKey("owner-A", key, now);
    expect(r.state).toBe("FOUND");
    expect(JSON.stringify(r)).not.toContain("PRIVATE_SENTINEL");
  });
  it("LR07 malformed stale responseJson UNKNOWN, never trust bookingId alone", async () => {
    m.receipt.mockResolvedValueOnce({ ...stored, responseJson: { state: "UNEXPECTED" } });
    expect(await lookupOwnConsultationBookingByKey("owner-A", key, now)).toEqual({
      state: "UNKNOWN",
    });
    expect(m.booking).not.toHaveBeenCalled();
  });
  it("LR08 cross-owner forged receipt bookingId mismatches booking owner", async () => {
    m.booking.mockResolvedValueOnce(null);
    expect(await lookupOwnConsultationBookingByKey("owner-B", key, now)).toEqual({
      state: "UNKNOWN",
    });
    expect(m.booking.mock.calls[0][0].where.clientId).toBe("owner-B");
  });
  it("LR09 status is current booking state, not stale archived response", async () => {
    m.booking.mockResolvedValueOnce({ ...owned, status: "CANCELLED_BY_SYSTEM" });
    expect(await lookupOwnConsultationBookingByKey("owner-A", key, now)).toMatchObject({
      state: "FOUND",
      booking: { status: "CANCELLED_BY_SYSTEM" },
    });
  });
  it("LR10 DB failure propagates to generic Hono 503 mapping, not 200 UNKNOWN", async () => {
    m.receipt.mockRejectedValueOnce(Error("SQL_PRIVATE_FAULT"));
    await expect(lookupOwnConsultationBookingByKey("owner-A", key, now)).rejects.toThrow(
      "SQL_PRIVATE_FAULT",
    );
  });
  it("LR11 calls strictly read-only; no arbitrary owner metadata", async () => {
    await lookupOwnConsultationBookingByKey("owner-A", key, now);
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});

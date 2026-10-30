/** Owner-scoped read-only booking receipt recovery for an ambiguous lost ACK.
 * New contract AG4_CONSULTATION_BOOKING_LOST_ACK_OWNER_SCOPED_LOOKUP_CONTRACT_V1.
 * UNKNOWN is never proof that no booking committed, and NEVER authorizes POST retry.
 */
import { prisma } from "@gafus/prisma";

export type BookingIdempotencyReadback =
  | { state: "FOUND"; booking: { id: string; status: string; slotId: string; createdAt: string } }
  | { state: "UNKNOWN" };

/** Authenticated session supplies ownerId; no owner selection from request body. */
export async function lookupOwnConsultationBookingByKey(
  ownerId: string,
  idempotencyKey: string,
  now = new Date(),
): Promise<BookingIdempotencyReadback> {
  if (!ownerId || !idempotencyKey || !Number.isFinite(now.getTime())) {
    return { state: "UNKNOWN" };
  }
  const receipt = await prisma.consultationBookingIdempotency.findUnique({
    where: { clientId_key: { clientId: ownerId, key: idempotencyKey } },
    select: { bookingId: true, responseJson: true, expiresAt: true },
  });
  if (!receipt || receipt.expiresAt <= now || !receipt.bookingId) return { state: "UNKNOWN" };
  const body = receipt.responseJson;
  // Support legacy minimal marker and completed v1 response, never trust arbitrary
  // malformed JSON as an authoritative booking witness.
  if (!body || typeof body !== "object" || Array.isArray(body)) return { state: "UNKNOWN" };
  const row = body as { state?: unknown; kind?: unknown; booking?: { id?: unknown } };
  if (
    row.state !== "BOOKING_CREATED" &&
    !(
      (row.kind === "created" || row.kind === "idempotent_replay") &&
      row.booking?.id === receipt.bookingId
    )
  ) {
    return { state: "UNKNOWN" };
  }
  const booking = await prisma.consultationBooking.findFirst({
    where: { id: receipt.bookingId, clientId: ownerId },
    select: { id: true, status: true, slotId: true, createdAt: true },
  });
  if (!booking) return { state: "UNKNOWN" };
  return {
    state: "FOUND",
    booking: {
      id: booking.id,
      status: booking.status,
      slotId: booking.slotId,
      createdAt: booking.createdAt.toISOString(),
    },
  };
}

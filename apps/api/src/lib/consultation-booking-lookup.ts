/** Compatibility import for legacy app callers; real owner-scoped persistence
 * belongs to the consultation server repository. Ambiguous ACK must never authorize a POST retry.
 */
export { lookupOwnConsultationBookingByKey } from "@gafus/consultation-server/booking-readback";
export type { BookingIdempotencyReadback } from "@gafus/consultation-server/booking-readback";

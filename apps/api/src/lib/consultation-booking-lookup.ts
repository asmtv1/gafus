/** Compatibility import for legacy app callers; real owner-scoped persistence
 * lives in Core. Ambiguous ACK must never authorize a POST retry.
 */
export { lookupOwnConsultationBookingByKey } from "@gafus/core/services/consultation";
export type { BookingIdempotencyReadback } from "@gafus/core/services/consultation";

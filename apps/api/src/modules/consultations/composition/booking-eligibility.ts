/** Binds the transaction-aware consultation repository to Core policy. */
import { createConsultationBookingEligibilityService } from "@gafus/core/services/consultation";
import { readClientConsultationRestrictions } from "@gafus/consultation-query-server/booking-eligibility";

export const { getConsultationBookingEligibility, requireConsultationBookingEligibility } =
  createConsultationBookingEligibilityService(readClientConsultationRestrictions);

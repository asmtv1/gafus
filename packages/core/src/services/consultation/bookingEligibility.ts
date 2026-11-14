/** Core provides the pure eligibility use case; composition supplies the repository. */
import {
  evaluateConsultationBookingRestrictions,
  CONSULTATION_BOOKING_COOLDOWN_MS,
  type ConsultationBookingRestrictions,
  type ConsultationBookingEligibility,
} from "@gafus/consultation-shared";
import { ConsultationBookingRestrictedError } from "./errors";

export { CONSULTATION_BOOKING_COOLDOWN_MS, evaluateConsultationBookingRestrictions };

export function createConsultationBookingEligibilityService<TDb>(
  readRestrictions: (clientId: string, db?: TDb) => Promise<ConsultationBookingRestrictions>,
) {
  async function getConsultationBookingEligibility(
    clientId: string, db?: TDb, now = new Date(),
  ): Promise<ConsultationBookingEligibility> {
    return evaluateConsultationBookingRestrictions(await readRestrictions(clientId, db), now);
  }
  async function requireConsultationBookingEligibility(clientId: string, db?: TDb): Promise<void> {
    const eligibility = await getConsultationBookingEligibility(clientId, db);
    if (!eligibility.canBook) throw new ConsultationBookingRestrictedError(eligibility);
  }
  return { getConsultationBookingEligibility, requireConsultationBookingEligibility };
}

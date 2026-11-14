import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
import { getConsultationBookingEligibility } from "./booking-eligibility.js";
import { listListedCynologists } from "./catalog-schedule.js";
import { createListCynologistsApplication } from "../application/list-cynologists.js";

export const listCynologistsApplication = createListCynologistsApplication({
  listListedCynologists: () => withCorrelatedUseCase("consultations.cynologists.catalog.read", () => listListedCynologists()),
  getBookingEligibility: (...args) => withCorrelatedUseCase("consultations.booking.eligibility.read", () => getConsultationBookingEligibility(...args)),
});

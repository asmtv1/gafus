/**
 * AG1-001 composition root for the already existing two-Core catalog read.
 */
import {
  getConsultationBookingEligibility,
  listListedCynologists,
} from "@gafus/core/services/consultation";
import { createListCynologistsApplication } from "../application/list-cynologists.js";

export const listCynologistsApplication = createListCynologistsApplication({
  listListedCynologists,
  getBookingEligibility: getConsultationBookingEligibility,
});

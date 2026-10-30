/**
 * AG1-001: compose two existing independent Core reads for a consultation
 * catalog: publicly listed cynologists + this authenticated actor's eligibility.
 * Core remains the sole source of both business and DB invariants.
 */
import type {
  getConsultationBookingEligibility,
  listListedCynologists,
} from "@gafus/core/services/consultation";

export type ListListedCynologistsPort = typeof listListedCynologists;
export type ConsultationBookingEligibilityPort = (
  actorUserId: string,
) => ReturnType<typeof getConsultationBookingEligibility>;

export function createListCynologistsApplication(deps: {
  listListedCynologists: ListListedCynologistsPort;
  getBookingEligibility: ConsultationBookingEligibilityPort;
}) {
  return {
    async execute({
      actorUserId,
      onCatalogLoaded,
    }: {
      actorUserId: string;
      onCatalogLoaded: () => void;
    }) {
      // Preserve the existing route lifecycle: first Core read, then a
      // caller-owned response-header effect, then owner eligibility Core read.
      // The callback has no Hono dependencies inside this application layer.
      const data = await deps.listListedCynologists();
      onCatalogLoaded();
      const bookingEligibility = await deps.getBookingEligibility(actorUserId);
      return { data, bookingEligibility };
    },
  };
}

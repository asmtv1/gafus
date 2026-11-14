/** Public catalog and booking eligibility for the authenticated actor. */
import type { ListedCynologistCardDto, ConsultationBookingEligibility } from "@gafus/core/services/consultation";

export type ListListedCynologistsPort = () => Promise<ListedCynologistCardDto[]>;
export type ConsultationBookingEligibilityPort = (
  actorUserId: string,
) => Promise<ConsultationBookingEligibility>;

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

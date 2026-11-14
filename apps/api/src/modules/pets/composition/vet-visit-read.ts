/**
 * Owner-scoped veterinary projection; Hono supplies the actor from verified
 * authentication. Core validates route IDs before the SQL port is invoked.
 */
export {
  getOwnVetVisitDetail,
  VetVisitDetailNotFoundError,
} from "@gafus/pets-server/vet-visit-detail";

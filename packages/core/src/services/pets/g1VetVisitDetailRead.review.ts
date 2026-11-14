/**
 * Core-owned private vet detail port. SQL access requires the authenticated
 * owner, pet and visit together; invalid IDs cannot reach persistence.
 */
import type { PetVetVisit } from "@gafus/types";
import { VetVisitDetailNotFoundError } from "@gafus/pets-shared/vet-visit-error";
export { VetVisitDetailNotFoundError } from "@gafus/pets-shared/vet-visit-error";

export type VetVisitDetailReadPort = (
  ownerId: string,
  petId: string,
  visitId: string,
) => Promise<PetVetVisit>;

export async function getOwnVetVisitDetail(
  ownerId: string,
  petId: string,
  visitId: string,
  read: VetVisitDetailReadPort,
): Promise<PetVetVisit> {
  const id = /^[A-Za-z0-9_-]{1,128}$/;
  if (!id.test(petId) || !id.test(visitId)) throw new VetVisitDetailNotFoundError();
  return read(ownerId, petId, visitId);
}

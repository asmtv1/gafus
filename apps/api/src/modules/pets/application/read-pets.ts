/** AG1-001: ordinary pets READ; ownership, JSON and HTTP errors stay in existing layers. */
import type { getUserPets, getPetById } from "@gafus/core/services/pets";

type UserPetsReader = typeof getUserPets;
type PetDetailReader = typeof getPetById;

export function createReadPetsApplication(dependencies: {
  readList: UserPetsReader;
  readDetail: PetDetailReader;
}) {
  return {
    list({ actorUserId }: { actorUserId: string }) {
      return dependencies.readList(actorUserId, { throwOnError: true });
    },
    detail({ petId, actorUserId }: { petId: string; actorUserId: string }) {
      return dependencies.readDetail(petId, actorUserId);
    },
  };
}

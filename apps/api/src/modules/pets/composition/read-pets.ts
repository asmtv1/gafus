/** AG1-001: bind only existing Core pet list/detail getters. */
import { getUserPets, getPetById } from "@gafus/core/services/petRead";
import { readOwnedPets, readOwnedPetDetail } from "@gafus/pets-server/pet-reads";
import { createReadPetsApplication } from "../application/read-pets.js";

export const readPetsApplication = createReadPetsApplication({
  readList: (actorUserId, options) => getUserPets(actorUserId, options, readOwnedPets),
  readDetail: (petId, actorUserId) => getPetById(petId, actorUserId, readOwnedPetDetail),
});

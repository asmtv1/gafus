/** AG1-001: bind only existing Core pet list/detail getters. */
import { getUserPets, getPetById } from "@gafus/core/services/petRead";
import { createReadPetsApplication } from "../application/read-pets.js";

export const readPetsApplication = createReadPetsApplication({
  readList: (actorUserId, options) => getUserPets(actorUserId, options),
  readDetail: (petId, actorUserId) => getPetById(petId, actorUserId),
});

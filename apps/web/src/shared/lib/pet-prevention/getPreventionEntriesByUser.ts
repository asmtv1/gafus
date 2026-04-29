"use server";

import { getEntriesByPet, getEntriesByPets } from "@gafus/core/services/petPrevention";

type PetPreventionDomainErrorCode = "PET_NOT_FOUND" | "PREVENTION_LOAD_FAILED";

function createDomainError(code: PetPreventionDomainErrorCode, message: string): Error {
  const error = new Error(message);
  (error as Error & { code: PetPreventionDomainErrorCode }).code = code;
  return error;
}

function mapGetEntriesErrorToCode(error: string): PetPreventionDomainErrorCode {
  if (error === "Питомец не найден") {
    return "PET_NOT_FOUND";
  }
  return "PREVENTION_LOAD_FAILED";
}

export async function getPreventionEntriesByPetForUser(userId: string, petId: string) {
  const result = await getEntriesByPet(userId, petId);
  if (!result.success) {
    throw createDomainError(mapGetEntriesErrorToCode(result.error), result.error);
  }
  return result.data;
}

export async function getPreventionEntriesByPetsForUser(userId: string, petIds: string[]) {
  const result = await getEntriesByPets(userId, petIds);
  if (!result.success) {
    throw createDomainError("PREVENTION_LOAD_FAILED", result.error);
  }
  return result.data;
}

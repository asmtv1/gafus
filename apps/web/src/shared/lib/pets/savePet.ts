"use server";

import { createWebLogger } from "@gafus/logger";
import { createPet as createPetInCore, updatePet as updatePetInCore } from "@gafus/core/services/pets";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import type { UpdatePetInput } from "@gafus/types";

import { createPetSchema, updatePetSchema } from "../validation/petSchemas";

const logger = createWebLogger("web-save-pet");

export async function savePet({
  id,
  name,
  type,
  breed,
  birthDate,
  heightCm,
  weightKg,
  notes,
}: UpdatePetInput) {
  try {
    const userId = await getCurrentUserId();
    const trimmedId = id?.trim();

    if (!trimmedId) {
      const validatedData = createPetSchema.parse({
        name,
        type,
        breed,
        birthDate,
        heightCm,
        weightKg,
        notes,
        photoUrl: undefined,
      });
      return createPetInCore(userId, validatedData);
    }
    const validatedData = updatePetSchema.parse({
      id: trimmedId,
      name,
      type,
      breed,
      birthDate,
      heightCm,
      weightKg,
      notes,
    });
    const { id: petId, ...updateData } = validatedData;
    const pet = await updatePetInCore(petId, userId, updateData);
    if (!pet) {
      throw new Error("Питомец не найден");
    }
    return pet;
  } catch (error) {
    logger.error("Ошибка в savePet:", error as Error, { operation: "error" });
    throw new Error("Ошибка при сохранении питомца. Попробуйте перезагрузить страницу.");
  }
}

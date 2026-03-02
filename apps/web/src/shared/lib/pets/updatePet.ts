"use server";

import { createWebLogger } from "@gafus/logger";
import { updatePet as updatePetInCore } from "@gafus/core/services/pets";

import type { UpdatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { updatePetSchema } from "../validation/petSchemas";

const logger = createWebLogger("web-update-pet");

export async function updatePet(data: UpdatePetInput) {
  const validatedData = updatePetSchema.parse(data);
  try {
    const userId = await getCurrentUserId();
    const { id, ...updateData } = validatedData;
    const pet = await updatePetInCore(id, userId, updateData);
    if (!pet) {
      throw new Error("Питомец не найден");
    }
    return pet;
  } catch (error) {
    logger.error("Ошибка при обновлении питомца:", error as Error, { operation: "error" });
    throw new Error("Не удалось обновить питомца");
  }
}

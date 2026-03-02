"use server";

import { createWebLogger } from "@gafus/logger";
import { createPet as createPetInCore } from "@gafus/core/services/pets";

import type { CreatePetInput } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { createPetSchema } from "../validation/petSchemas";

const logger = createWebLogger("web-create-pet");

export async function createPet(data: CreatePetInput) {
  const validatedData = createPetSchema.parse(data);
  try {
    const userId = await getCurrentUserId();
    return createPetInCore(userId, validatedData);
  } catch (error) {
    logger.error("Ошибка при создании питомца:", error as Error, { operation: "error" });
    throw new Error("Не удалось создать питомца");
  }
}

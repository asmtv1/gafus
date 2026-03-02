"use server";

import { revalidatePath } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import { deletePet as deletePetInCore } from "@gafus/core/services/pets";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { petIdSchema } from "../validation/petSchemas";

const logger = createWebLogger("web-delete-pet");

export async function deletePet(petId: string, pathToRevalidate?: string) {
  const safePetId = petIdSchema.parse(petId);
  try {
    const userId = await getCurrentUserId();
    const deleted = await deletePetInCore(safePetId, userId);
    if (!deleted) {
      throw new Error("Питомец не найден");
    }
    if (pathToRevalidate) {
      revalidatePath(pathToRevalidate);
    }
  } catch (error) {
    logger.error("Ошибка при удалении питомца:", error as Error, { operation: "error" });
    throw new Error("Не удалось удалить питомца");
  }
}

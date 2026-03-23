"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
  createEntry,
  createEntrySchema,
} from "@gafus/core/services/petPrevention";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("pet-prevention");

export async function createPreventionEntry(
  petId: string,
  data: Record<string, unknown>,
) {
  try {
    const userId = await getCurrentUserId();
    const validated = createEntrySchema.parse(data);
    const result = await createEntry(userId, petId, validated);
    if (result.success) {
      revalidatePath(`/profile/pets/${petId}/prevention`);
    }
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      logger.error("createPreventionEntry validation failed", error, {
        petId,
        zodFlatten: error.flatten(),
      });
      return { success: false as const, error: "Неверные данные" };
    }
    logger.error("createPreventionEntry failed", error as Error, { petId });
    return { success: false as const, error: "Не удалось создать запись" };
  }
}

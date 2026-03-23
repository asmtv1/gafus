"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import {
  updateEntry,
  updateEntrySchema,
} from "@gafus/core/services/petPrevention";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("pet-prevention");

export async function updatePreventionEntry(
  petId: string,
  entryId: string,
  data: Record<string, unknown>,
) {
  try {
    const userId = await getCurrentUserId();
    const validated = updateEntrySchema.parse(data);
    const result = await updateEntry(userId, petId, entryId, validated);
    if (result.success) {
      revalidatePath(`/profile/pets/${petId}/prevention`);
    }
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      logger.error("updatePreventionEntry validation failed", error, {
        petId,
        entryId,
        zodFlatten: error.flatten(),
      });
      return { success: false as const, error: "Неверные данные" };
    }
    logger.error("updatePreventionEntry failed", error as Error, { petId, entryId });
    return { success: false as const, error: "Не удалось обновить запись" };
  }
}

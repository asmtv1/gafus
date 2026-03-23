"use server";

import { revalidatePath } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import { deleteEntry } from "@gafus/core/services/petPrevention";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("pet-prevention");

export async function deletePreventionEntry(petId: string, entryId: string) {
  try {
    const userId = await getCurrentUserId();
    const result = await deleteEntry(userId, petId, entryId);
    if (result.success) {
      revalidatePath(`/profile/pets/${petId}/prevention`);
    }
    return result;
  } catch (error) {
    logger.error("deletePreventionEntry failed", error as Error);
    return { success: false, error: "Не удалось удалить запись" };
  }
}

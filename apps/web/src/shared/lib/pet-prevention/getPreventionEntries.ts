import { getEntriesByPet } from "@gafus/core/services/petPrevention";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

/**
 * Получение записей профилактики по питомцу (для RSC)
 */
export async function getPreventionEntries(petId: string) {
  try {
    const userId = await getCurrentUserId();
    const result = await getEntriesByPet(userId, petId);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

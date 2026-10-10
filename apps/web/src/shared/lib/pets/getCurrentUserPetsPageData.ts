"use server";

import { createWebLogger } from "@gafus/logger";

import { getUserPets } from "@gafus/core/services/pets";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";

import type { Pet } from "@gafus/types";

const logger = createWebLogger("web-get-current-user-pets-page-data");

interface CurrentUserPetsPageData {
  pets: Pet[];
}

/**
 * Возвращает данные для страницы /pets через единый server-адаптер web-слоя.
 */
export async function getCurrentUserPetsPageData(): Promise<CurrentUserPetsPageData | null> {
  try {
    const userData = await getUserWithTrainings();
    if (!userData) {
      return null;
    }

    return { pets: await getUserPets(userData.id) };
  } catch (error) {
    logger.error("Ошибка при получении данных страницы питомцев", error as Error);
    throw error;
  }
}

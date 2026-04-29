"use server";

import { createWebLogger } from "@gafus/logger";

import { getPublicProfile } from "@shared/lib/profile/getPublicProfile";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";

import type { PublicProfile } from "@gafus/types";

const logger = createWebLogger("web-get-current-user-pets-page-data");

interface CurrentUserPetsPageData {
  pets: PublicProfile["pets"];
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

    const publicProfile = await getPublicProfile(userData.username);
    if (!publicProfile) {
      return null;
    }

    return { pets: publicProfile.pets };
  } catch (error) {
    logger.error("Ошибка при получении данных страницы питомцев", error as Error);
    throw error;
  }
}

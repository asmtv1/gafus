import { createWebLogger } from "@gafus/logger";
import { getPublicProfile as getPublicProfileCore } from "@gafus/core/services/user";

import type { PublicProfile } from "@gafus/types";

const logger = createWebLogger("web-get-public-profile");

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  try {
    return await getPublicProfileCore(username);
  } catch (e) {
    logger.error("Ошибка в getPublicProfile", e as Error, { operation: "error" });
    throw new Error("Не удалось загрузить публичный профиль");
  }
}

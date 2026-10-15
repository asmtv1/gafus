"use server";

import { createWebLogger } from "@gafus/logger";
import { getArticles, type GetArticlesResult } from "@gafus/core/services/article";
import { optionalUserIdSchema } from "../validation/schemas";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-cached-articles");

/**
 * Retain the server-action API but do not cache article rows by user.
 * The response includes subscription-derived media URLs and hasAccess;
 * stale 5-minute snapshots would survive cancellation and rewarded expiry.
 */
export async function getArticlesCached(userId?: string): Promise<GetArticlesResult> {
  const requestedUserId = optionalUserIdSchema.parse(userId);
  // The optional argument is only for legacy call sites, never an identity.
  const currentUserId = await getCurrentUserId().catch(() => undefined);
  if (requestedUserId && requestedUserId !== currentUserId) {
    return { success: false, error: "Нет доступа к статьям другого пользователя" };
  }
  try {
    return await getArticles(currentUserId);
  } catch (error) {
    logger.error("Error in getArticlesCached", error as Error);
    return { success: false, error: "Ошибка получения статей" };
  }
}

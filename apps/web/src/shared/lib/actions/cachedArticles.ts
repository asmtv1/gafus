"use server";

import { unstable_cache } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import {
  getArticles,
  type GetArticlesResult,
} from "@gafus/core/services/article";
import { optionalUserIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-cached-articles");

export async function getArticlesCached(userId?: string): Promise<GetArticlesResult> {
  const safeUserId = optionalUserIdSchema.parse(userId) ?? undefined;
  const cacheKeyUserId = safeUserId ?? "anonymous";

  const cachedFunction = unstable_cache(
    async (): Promise<GetArticlesResult> => {
      try {
        const result = await getArticles(safeUserId ?? undefined);
        return result;
      } catch (error) {
        logger.error("Error in getArticlesCached", error as Error);
        return { success: false, error: "Ошибка получения статей" };
      }
    },
    ["articles-all", cacheKeyUserId],
    {
      revalidate: 5 * 60,
      tags: ["articles", `user-articles-${cacheKeyUserId}`],
    }
  );
  return await cachedFunction();
}

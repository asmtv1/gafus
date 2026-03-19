"use server";

import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("trainer-panel-invalidate-articles-cache");

/**
 * Инвалидирует кэш статей на web.
 * Вызывается при создании, обновлении или удалении статей.
 * @param slug — при передаче инвалидирует только страницу статьи; без slug — весь список
 */
export async function invalidateArticlesCache(slug?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const webUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gafus.ru";
    const revalidateUrl = `${webUrl}/api/revalidate/articles`;
    const secretToken = process.env.REVALIDATE_SECRET_TOKEN;

    if (!secretToken) {
      logger.warn("[Cache] REVALIDATE_SECRET_TOKEN not set, skipping web articles cache invalidation", {
        operation: "warn",
      });
      return { success: true };
    }

    const response = await fetch(revalidateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slug ? { slug } : {}),
    });

    if (!response.ok) {
      logger.warn("[Cache] Failed to invalidate web articles cache", {
        status: response.status,
        slug,
        operation: "warn",
      });
      return { success: false, error: `HTTP ${response.status}` };
    }

    logger.info("[Cache] Web articles cache invalidated", { slug, operation: "info" });
    return { success: true };
  } catch (err) {
    logger.warn("[Cache] Error invalidating web articles cache (non-critical)", {
      error: err instanceof Error ? err.message : String(err),
      operation: "warn",
    });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

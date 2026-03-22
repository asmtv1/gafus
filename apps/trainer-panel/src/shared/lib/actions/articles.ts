"use server";

import { getCurrentUserId } from "@gafus/auth/server";
import { createWebLogger } from "@gafus/logger";
import {
  createArticle,
  updateArticle,
  deleteArticle,
  getArticleViewersForAuthor,
} from "@gafus/core/services/article";
import type { ArticleViewerDto } from "@gafus/types";
import { deleteFolderFromCDN } from "@gafus/cdn-upload";
import { revalidatePath } from "next/cache";
import { invalidateArticlesCache } from "./invalidateArticlesCache";

const logger = createWebLogger("trainer-article-actions");

export async function createArticleAction(input: Record<string, unknown>) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Не авторизован" };
    const result = await createArticle(input, userId);
    if (result.success) {
      revalidatePath("/main-panel/articles");
      await invalidateArticlesCache();
    }
    return result;
  } catch (error) {
    logger.error("Ошибка создания статьи", error as Error);
    return { success: false, error: "Не удалось создать статью" };
  }
}

export async function updateArticleAction(
  id: string,
  input: Record<string, unknown>
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Не авторизован" };
    const result = await updateArticle(id, input, userId);
    if (result.success) {
      revalidatePath("/main-panel/articles");
      revalidatePath(`/main-panel/articles/${id}/edit`);
      const slug = typeof input.slug === "string" ? input.slug : undefined;
      await invalidateArticlesCache(slug);
    }
    return result;
  } catch (error) {
    logger.error("Ошибка обновления статьи", error as Error);
    return { success: false, error: "Не удалось обновить статью" };
  }
}

export async function getArticleViewersAction(
  articleId: string
): Promise<
  | { success: true; data: ArticleViewerDto[] }
  | { success: false; error: string }
> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Не авторизован" };
    return await getArticleViewersForAuthor(articleId, userId);
  } catch (error) {
    logger.error("Ошибка списка просмотров статьи", error as Error);
    return { success: false, error: "Не удалось загрузить список" };
  }
}

export async function deleteArticleAction(id: string) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: "Не авторизован" };
    const result = await deleteArticle(id, userId);
    if (!result.success) return result;

    if (result.trainerId) {
      try {
        const folderPath = `trainers/${result.trainerId}/articles/${id}`;
        const deletedCount = await deleteFolderFromCDN(folderPath);
        logger.info("Папка статьи удалена из CDN", { folderPath, deletedCount });
      } catch (cdnErr) {
        logger.warn("Не удалось удалить файлы статьи из CDN", {
          error: cdnErr instanceof Error ? cdnErr.message : String(cdnErr),
        });
      }
    }

    revalidatePath("/main-panel/articles");
    await invalidateArticlesCache();
    return result;
  } catch (error) {
    logger.error("Ошибка удаления статьи", error as Error);
    return { success: false, error: "Не удалось удалить статью" };
  }
}

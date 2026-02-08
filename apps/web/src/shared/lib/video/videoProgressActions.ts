"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getProgress, saveProgress } from "@gafus/core/services/video";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("videoProgressActions");

// Zod схемы валидации
const videoIdSchema = z.string().trim().min(1, "videoId обязателен");
const positionSecSchema = z
  .number()
  .int()
  .min(0)
  .max(86400 * 24, "Позиция вне допустимого диапазона");

/**
 * Получает последнюю сохраненную позицию просмотра видео для текущего пользователя
 *
 * @param videoId - ID видео
 * @returns Объект с lastPositionSec или null если прогресса нет или нет сессии
 */
export async function getVideoProgress(
  videoId: string,
): Promise<{ lastPositionSec: number } | null> {
  try {
    // Валидация
    const safeVideoId = videoIdSchema.parse(videoId);

    // Получаем сессию
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return null;
    }

    // Вызываем сервис из core
    const progress = await getProgress(session.user.id, safeVideoId);
    return progress;
  } catch (error) {
    console.error("[getVideoProgress] Ошибка при получении прогресса:", error);
    return null;
  }
}

/**
 * Сохраняет позицию просмотра видео для текущего пользователя
 *
 * @param videoId - ID видео
 * @param positionSec - Позиция в секундах
 * @returns Результат операции с success/error
 */
export async function saveVideoProgress(
  videoId: string,
  positionSec: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Валидация
    const safeVideoId = videoIdSchema.parse(videoId);
    const safePositionSec = positionSecSchema.parse(positionSec);

    // Получаем сессию
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Нет авторизации" };
    }

    // Вызываем сервис из core
    const result = await saveProgress(session.user.id, safeVideoId, safePositionSec);
    return result;
  } catch (error) {
    console.error("[saveVideoProgress] Ошибка при сохранении прогресса:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || "Ошибка валидации" };
    }
    return { success: false, error: "Ошибка при сохранении прогресса" };
  }
}

/**
 * Синхронизирует прогрессы просмотра из локального хранилища (IndexedDB) на сервер
 * Используется при переходе из офлайн режима в онлайн
 *
 * @param payload - Массив объектов с videoId и lastPositionSec
 * @returns Результат операции с success/error
 */
export async function syncVideoProgressFromLocal(payload: {
  videoId: string;
  lastPositionSec: number;
}[]): Promise<{ success: boolean; error?: string; syncedCount?: number }> {
  try {
    // Получаем сессию
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Нет авторизации" };
    }

    // Синхронизируем все элементы параллельно (10x быстрее при 10 видео)
    const results = await Promise.allSettled(
      payload.map(async (item) => {
        try {
          // Валидация
          const safeVideoId = videoIdSchema.parse(item.videoId);
          const safePositionSec = positionSecSchema.parse(item.lastPositionSec);

          // Вызываем сервис
          return await saveProgress(session.user.id, safeVideoId, safePositionSec);
        } catch (itemError) {
          console.warn("[syncVideoProgressFromLocal] Ошибка валидации элемента:", item, itemError);
          return { success: false, error: "Validation failed" };
        }
      })
    );

    // Подсчитываем успешно синхронизированные
    const syncedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.success
    ).length;

    logger.info("Синхронизировано прогрессов", { syncedCount, total: payload.length });
    return { success: true, syncedCount };
  } catch (error) {
    logger.error("Ошибка при синхронизации", error as Error);
    return { success: false, error: "Ошибка при синхронизации прогресса" };
  }
}

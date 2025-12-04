"use server";

import { unstable_cache } from "next/cache";
import { prisma } from "@gafus/prisma";
import { getCurrentUserId } from "@/utils";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('web-get-user-training-dates');

/**
 * Базовая функция для получения дат занятий пользователя из БД
 * Выполняется без кэширования для актуальных данных
 */
async function getUserTrainingDatesRaw(userId: string): Promise<Date[]> {
  // Оптимизированный запрос: получаем даты из завершенных шагов и дней параллельно
  const [completedSteps, completedDays] = await Promise.all([
    prisma.userStep.findMany({
      where: {
        userTraining: {
          userId,
        },
        status: "COMPLETED",
      },
      select: {
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.userTraining.findMany({
      where: {
        userId,
        status: "COMPLETED",
      },
      select: {
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
  ]);

  // Объединяем все даты и оставляем уникальные по дню (без времени)
  const allDates = new Set<string>();
  
  [...completedSteps, ...completedDays].forEach((item) => {
    const date = new Date(item.updatedAt);
    // Нормализуем до начала дня (00:00:00) для корректного сравнения
    date.setHours(0, 0, 0, 0);
    allDates.add(date.toISOString());
  });

  // Преобразуем обратно в Date объекты и сортируем по убыванию
  const uniqueDates = Array.from(allDates)
    .map((iso) => new Date(iso))
    .sort((a, b) => b.getTime() - a.getTime());

  return uniqueDates;
}

/**
 * Получает уникальные даты, когда пользователь завершал шаги или дни тренировок
 * Используется для правильного подсчета серий занятий
 * 
 * Данные кэшируются на 5 минут для оптимизации производительности.
 * Кэш инвалидируется при обновлении прогресса пользователя.
 * 
 * @returns Массив уникальных дат занятий, отсортированных по убыванию (самые свежие первыми)
 * 
 * @example
 * ```typescript
 * const dates = await getUserTrainingDates();
 * // dates = [2024-01-03, 2024-01-02, 2024-01-01, ...]
 * ```
 */
export async function getUserTrainingDates(): Promise<Date[]> {
  try {
    const userId = await getCurrentUserId();

    // Кэшируем данные на 5 минут с тегом для инвалидации
    const cachedFunction = unstable_cache(
      async () => {
        logger.info("[Cache] Fetching user training dates", { userId, operation: 'info' });
        return await getUserTrainingDatesRaw(userId);
      },
      ["user-training-dates", userId],
      {
        revalidate: 300, // 5 минут - баланс между актуальностью и производительностью
        tags: ["achievements", "streaks", `user-${userId}`],
      }
    );

    return await cachedFunction();
  } catch (error) {
    logger.error("Ошибка получения дат занятий", error as Error, {
      operation: 'get_user_training_dates_error'
    });

    // Логируем ошибку через logger (отправляется в Loki)
    logger.error(
      error instanceof Error ? error.message : "Unknown error in getUserTrainingDates",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "getUserTrainingDates",
        action: "getUserTrainingDates",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["achievements", "streaks", "server-action"],
      }
    );

    return [];
  }
}


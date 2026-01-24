/**
 * Achievements Dates Service - бизнес-логика работы с датами тренировок
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Кэширование реализуется в Server Actions.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("achievements-dates-service");

/**
 * Получает уникальные даты, когда пользователь завершал шаги или дни тренировок
 * Используется для правильного подсчета серий занятий
 *
 * @param userId - ID пользователя
 * @returns Массив уникальных дат занятий, отсортированных по убыванию
 *
 * @example
 * ```typescript
 * const dates = await getUserTrainingDates("user-123");
 * // dates = [2024-01-03, 2024-01-02, 2024-01-01, ...]
 * ```
 */
export async function getUserTrainingDates(userId: string): Promise<Date[]> {
  logger.info("Fetching user training dates", { userId });

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

  logger.info("Retrieved training dates", { userId, count: uniqueDates.length });
  return uniqueDates;
}

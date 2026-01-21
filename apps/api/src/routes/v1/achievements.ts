/**
 * Achievements Routes
 * Endpoints для работы с достижениями
 */
import { Hono } from "hono";

import { getUserTrainingDates } from "@gafus/core/services/achievements";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-achievements");

export const achievementsRoutes = new Hono();

// ==================== GET /achievements/training-dates ====================
// Получить уникальные даты тренировок пользователя
achievementsRoutes.get("/training-dates", async (c) => {
  try {
    const user = c.get("user");
    const dates = await getUserTrainingDates(user.id);

    return c.json(
      { success: true, data: dates },
      {
        headers: {
          "Cache-Control": "private, max-age=300", // 5 минут
        },
      }
    );
  } catch (error) {
    logger.error("Error in training-dates API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

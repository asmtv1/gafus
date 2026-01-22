/**
 * Achievements Routes
 * Endpoints для работы с достижениями
 */
import { Hono } from "hono";

import {
  getUserTrainingDates,
  getAchievementStats,
} from "@gafus/core/services/achievements";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-achievements");

export const achievementsRoutes = new Hono();

const CACHE_HEADERS = { "Cache-Control": "private, max-age=300" };

// ==================== GET /achievements/training-dates ====================
achievementsRoutes.get("/training-dates", async (c) => {
  try {
    const user = c.get("user");
    const dates = await getUserTrainingDates(user.id);
    const datesAsStrings = dates.map((d) => d.toISOString());

    return c.json(
      { success: true, data: { dates: datesAsStrings } },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    logger.error("Error in training-dates API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /achievements ====================
achievementsRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const data = await getAchievementStats(user.id);
    return c.json({ success: true, data }, { headers: CACHE_HEADERS });
  } catch (error) {
    logger.error("Error in achievements API", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

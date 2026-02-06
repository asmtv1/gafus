/**
 * Offline Routes
 * Endpoints для работы с офлайн-данными курсов
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getCourseVersion,
  checkCourseUpdates,
  downloadFullCourse,
} from "@gafus/core/services/offline";
import { getTrainingDays } from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-offline");

export const offlineRoutes = new Hono();

// ==================== GET /offline/course/version ====================
// Получить версию курса
const versionQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

offlineRoutes.get("/course/version", zValidator("query", versionQuerySchema), async (c) => {
  try {
    const { courseType } = c.req.valid("query");
    const result = await getCourseVersion(courseType);

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Ошибка", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: { version: result.version } });
  } catch (error) {
    logger.error("Error getting course version", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /offline/course/updates ====================
// Проверить обновления курса
const updatesQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  clientVersion: z.string().min(1, "clientVersion обязателен"),
});

offlineRoutes.get("/course/updates", zValidator("query", updatesQuerySchema), async (c) => {
  try {
    const { courseType, clientVersion } = c.req.valid("query");
    const result = await checkCourseUpdates(courseType, clientVersion);

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Ошибка", code: "NOT_FOUND" }, 404);
    }

    return c.json({
      success: true,
      data: {
        hasUpdates: result.hasUpdates,
        serverVersion: result.serverVersion,
      },
    });
  } catch (error) {
    logger.error("Error checking course updates", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /offline/course/download ====================
// Скачать полный курс
const downloadQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

offlineRoutes.get("/course/download", zValidator("query", downloadQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType } = c.req.valid("query");

    try {
      await getTrainingDays(user.id, courseType);
    } catch (accessError) {
      if (
        accessError instanceof Error &&
        accessError.message === "COURSE_ACCESS_DENIED"
      ) {
        return c.json(
          { success: false, error: "Нет доступа к курсу", code: "COURSE_ACCESS_DENIED" },
          403,
        );
      }
      throw accessError;
    }

    const result = await downloadFullCourse(courseType);

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Ошибка", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: result.data });
  } catch (error) {
    logger.error("Error downloading course", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

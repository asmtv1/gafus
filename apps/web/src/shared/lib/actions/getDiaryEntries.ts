"use server";

import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { getDiaryEntries as getDiaryEntriesService } from "@gafus/core/services/diary";
import type { DiaryEntryWithDay } from "@gafus/core/services/diary";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-get-diary-entries");

const getDiaryEntriesSchema = z.object({
  courseId: courseIdSchema,
  upToDayOnCourseId: dayIdSchema.optional(),
});

export type GetDiaryEntriesResult =
  | { success: true; entries: DiaryEntryWithDay[] }
  | { success: false; error: string; entries?: never };

/**
 * Возвращает записи дневника по курсу для текущего пользователя (тонкий слой: сессия + валидация, вызов core).
 */
export async function getDiaryEntries(
  courseId: string,
  upToDayOnCourseId?: string,
): Promise<GetDiaryEntriesResult> {
  try {
    const safeInput = getDiaryEntriesSchema.parse({ courseId, upToDayOnCourseId });
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Необходимо войти в аккаунт" };
    }
    const result = await getDiaryEntriesService(
      userId,
      safeInput.courseId,
      safeInput.upToDayOnCourseId,
    );
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, entries: result.entries };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const msg = error.errors.map((e) => e.message).join("; ");
      return { success: false, error: msg };
    }
    logger.error("Ошибка при получении записей дневника", error as Error, {
      operation: "get_diary_entries",
      courseId,
    });
    return { success: false, error: "Не удалось загрузить записи" };
  }
}

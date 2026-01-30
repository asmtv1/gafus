"use server";

import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { saveDiaryEntry as saveDiaryEntryService } from "@gafus/core/services/diary";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { dayIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-save-diary-entry");

const saveDiaryEntrySchema = z.object({
  dayOnCourseId: dayIdSchema,
  content: z.string().trim().min(1, "Текст записи не может быть пустым").max(10000, "Текст не должен превышать 10000 символов"),
});

export type SaveDiaryEntryResult = { success: boolean; error?: string };

/**
 * Сохраняет запись дневника успехов (тонкий слой: сессия + валидация, вызов core).
 */
export async function saveDiaryEntry(
  dayOnCourseId: string,
  content: string,
): Promise<SaveDiaryEntryResult> {
  try {
    const safeInput = saveDiaryEntrySchema.parse({ dayOnCourseId, content });
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Необходимо войти в аккаунт" };
    }
    return await saveDiaryEntryService(userId, safeInput.dayOnCourseId, safeInput.content);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const msg = error.errors.map((e) => e.message).join("; ");
      return { success: false, error: msg };
    }
    logger.error("Ошибка при сохранении записи дневника", error as Error, {
      operation: "save_diary_entry",
      dayOnCourseId,
    });
    return { success: false, error: "Не удалось сохранить запись" };
  }
}

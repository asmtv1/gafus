/**
 * Diary Service - бизнес-логика работы с дневником успехов
 *
 * Чистая бизнес-логика без Next.js специфики.
 */

import type { DiaryEntryWithDay, DiaryPersistencePort } from "./diaryPersistencePort";
export type { DiaryEntryWithDay, DiaryPersistencePort } from "./diaryPersistencePort";
import { createWebLogger } from "@gafus/logger";


const logger = createWebLogger("diary-service");

const MAX_CONTENT_LENGTH = 10000;

/**
 * Сохраняет запись дневника (upsert по userId + dayOnCourseId).
 * Проверяет доступ к курсу по dayOnCourseId; ограничивает длину content.
 */
export async function saveDiaryEntry(
  repo: DiaryPersistencePort,
  checkCourseAccessById: (courseId: string, userId: string) => Promise<{ hasAccess: boolean }>,
  userId: string,
  dayOnCourseId: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "Текст записи не может быть пустым" };
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    return {
      success: false,
      error: `Текст записи не должен превышать ${MAX_CONTENT_LENGTH} символов`,
    };
  }

  const dayOnCourse = await repo.readDiaryDayOccurrence(dayOnCourseId);
  if (!dayOnCourse) {
    return { success: false, error: "День курса не найден" };
  }

  const { hasAccess } = await checkCourseAccessById(dayOnCourse.courseId, userId);
  if (!hasAccess) {
    logger.warn("Попытка сохранить запись дневника без доступа к курсу", {
      userId,
      dayOnCourseId,
      courseId: dayOnCourse.courseId,
    });
    return { success: false, error: "Нет доступа к курсу" };
  }

  await repo.writeDiaryUserDay(userId, dayOnCourse.dayId, trimmed);

  logger.info("Запись дневника сохранена", { userId, dayOnCourseId });
  return { success: true };
}

/**
 * Возвращает записи дневника по курсу для пользователя (по порядку дней).
 * courseIdOrType — Course.id (cuid) или course.type; резолвится внутри.
 * При upToDayOnCourseId — только дни до и включая указанный (по order).
 */
export async function getDiaryEntries(
  repo: DiaryPersistencePort,
  checkCourseAccessById: (courseId: string, userId: string) => Promise<{ hasAccess: boolean }>,
  userId: string,
  courseIdOrType: string,
  upToDayOnCourseId?: string,
): Promise<{ entries: DiaryEntryWithDay[]; error?: string }> {
  const courseId = await repo.resolveDiaryCourseId(courseIdOrType);
  if (!courseId) {
    return { entries: [], error: "Курс не найден" };
  }

  const { hasAccess } = await checkCourseAccessById(courseId, userId);
  if (!hasAccess) {
    logger.warn("Попытка получить записи дневника без доступа к курсу", {
      userId,
      courseId,
    });
    return { entries: [], error: "Нет доступа к курсу" };
  }

  const entries: DiaryEntryWithDay[] = await repo.readDiaryCourseEntries(
    userId,
    courseId,
    upToDayOnCourseId,
  );

  return { entries };
}

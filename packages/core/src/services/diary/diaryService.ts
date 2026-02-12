/**
 * Diary Service - бизнес-логика работы с дневником успехов
 *
 * Чистая бизнес-логика без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { checkCourseAccessById } from "../course/courseService";

const logger = createWebLogger("diary-service");

const MAX_CONTENT_LENGTH = 10000;

/**
 * Возвращает Course.id по переданному значению: если это cuid — ищем по id,
 * иначе по type (чтобы mobile и др. могли передавать courseType до загрузки дня).
 */
async function resolveCourseId(courseIdOrType: string): Promise<string | null> {
  const byId = await prisma.course.findUnique({
    where: { id: courseIdOrType },
    select: { id: true },
  });
  if (byId) return byId.id;
  const byType = await prisma.course.findFirst({
    where: { type: courseIdOrType },
    select: { id: true },
  });
  return byType?.id ?? null;
}

export interface DiaryEntryWithDay {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  dayOnCourseId: string;
  dayOrder: number;
  dayTitle: string;
}

/**
 * Сохраняет запись дневника (upsert по userId + dayOnCourseId).
 * Проверяет доступ к курсу по dayOnCourseId; ограничивает длину content.
 */
export async function saveDiaryEntry(
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

  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    select: { courseId: true },
  });
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

  await prisma.diaryEntry.upsert({
    where: {
      userId_dayOnCourseId: { userId, dayOnCourseId },
    },
    create: {
      userId,
      dayOnCourseId,
      content: trimmed,
    },
    update: { content: trimmed, updatedAt: new Date() },
  });

  logger.info("Запись дневника сохранена", { userId, dayOnCourseId });
  return { success: true };
}

/**
 * Возвращает записи дневника по курсу для пользователя (по порядку дней).
 * courseIdOrType — Course.id (cuid) или course.type; резолвится внутри.
 * При upToDayOnCourseId — только дни до и включая указанный (по order).
 */
export async function getDiaryEntries(
  userId: string,
  courseIdOrType: string,
  upToDayOnCourseId?: string,
): Promise<{ entries: DiaryEntryWithDay[]; error?: string }> {
  const courseId = await resolveCourseId(courseIdOrType);
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

  let upToOrder: number | null = null;
  if (upToDayOnCourseId) {
    const day = await prisma.dayOnCourse.findUnique({
      where: { id: upToDayOnCourseId, courseId },
      select: { order: true },
    });
    if (day) upToOrder = day.order;
  }

  const diaryEntries = await prisma.diaryEntry.findMany({
    where: {
      userId,
      dayOnCourse: {
        courseId,
        ...(upToOrder !== null ? { order: { lte: upToOrder } } : {}),
      },
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      dayOnCourseId: true,
      dayOnCourse: {
        select: { order: true, day: { select: { title: true } } },
      },
    },
    orderBy: {
      dayOnCourse: { order: "asc" },
    },
  });

  const entries: DiaryEntryWithDay[] = diaryEntries.map((e) => ({
    id: e.id,
    content: e.content,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    dayOnCourseId: e.dayOnCourseId,
    dayOrder: e.dayOnCourse.order,
    dayTitle: e.dayOnCourse.day.title,
  }));

  return { entries };
}

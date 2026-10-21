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
async function resolveCourse(courseIdOrType: string): Promise<{ id: string; isPrivate: boolean } | null> {
  const byId = await prisma.course.findUnique({
    where: { id: courseIdOrType },
    select: { id: true, isPrivate: true },
  });
  if (byId) return byId;
  const byType = await prisma.course.findFirst({
    where: { type: courseIdOrType },
    select: { id: true, isPrivate: true },
  });
  return byType;
}

export interface DiaryEntryWithDay {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  dayId: string;
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
    select: { dayId: true, courseId: true, course: { select: { isPrivate: true } } },
  });
  if (!dayOnCourse) {
    return { success: false, error: "День курса не найден" };
  }

  // DIARY stays free in public Paid and Full Access courses.
  const hasAccess = dayOnCourse.course?.isPrivate === false ||
    (await checkCourseAccessById(dayOnCourse.courseId, userId)).hasAccess;
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
      userId_dayId: { userId, dayId: dayOnCourse.dayId },
    },
    create: {
      userId,
      dayId: dayOnCourse.dayId,
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
  const course = await resolveCourse(courseIdOrType);
  if (!course) {
    return { entries: [], error: "Курс не найден" };
  }
  const courseId = course.id;

  const hasAccess = course.isPrivate === false || (await checkCourseAccessById(courseId, userId)).hasAccess;
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

  const courseDays = await prisma.dayOnCourse.findMany({
    where: {
      courseId,
      ...(upToOrder !== null ? { order: { lte: upToOrder } } : {}),
    },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      dayId: true,
      day: { select: { title: true } },
    },
  });
  const dayIds = courseDays.map((d) => d.dayId);
  const dayIdToDoc = new Map(
    courseDays.map((d) => [
      d.dayId,
      { order: d.order, title: d.day.title, dayOnCourseId: d.id },
    ]),
  );

  const rawEntries = await prisma.diaryEntry.findMany({
    where: { userId, dayId: { in: dayIds } },
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      dayId: true,
    },
  });

  rawEntries.sort(
    (a, b) =>
      (dayIdToDoc.get(a.dayId)?.order ?? 0) -
      (dayIdToDoc.get(b.dayId)?.order ?? 0),
  );

  const entries: DiaryEntryWithDay[] = rawEntries.map((e) => {
    const doc = dayIdToDoc.get(e.dayId)!;
    return {
      id: e.id,
      content: e.content,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      dayId: e.dayId,
      dayOnCourseId: doc.dayOnCourseId,
      dayOrder: doc.order,
      dayTitle: doc.title,
    };
  });

  return { entries };
}

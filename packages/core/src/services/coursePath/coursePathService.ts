/**
 * Сервис сбора данных для экспорта «Ваш путь» (PDF).
 * Проверка доступа и сбор курса, дневника, дат — в core.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { getDiaryEntries } from "../diary";
import { checkCourseAccessById } from "../course/courseService";

import type { CoursePathData, CoursePathEntry } from "./types";

const logger = createWebLogger("core-course-path");

const EXCERPT_LENGTH = 250;

export async function getCoursePathData(
  userId: string,
  courseId: string,
): Promise<{ success: true; data: CoursePathData } | { success: false; error: string }> {
  try {
    const { hasAccess } = await checkCourseAccessById(courseId, userId);
    if (!hasAccess) {
      logger.warn("Access denied for course path", { userId, courseId });
      return { success: false, error: "Нет доступа к курсу" };
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true, type: true },
    });
    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    const diaryResult = await getDiaryEntries(userId, courseId);
    if (diaryResult.error) {
      logger.warn("Diary entries error", { error: diaryResult.error, userId, courseId });
      return { success: false, error: diaryResult.error };
    }

    const userCourse = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { startedAt: true, completedAt: true },
    });

    const entriesWithExcerpt: CoursePathEntry[] = diaryResult.entries.map((entry) => ({
      ...entry,
      contentExcerpt:
        entry.content.length > EXCERPT_LENGTH
          ? entry.content.slice(0, EXCERPT_LENGTH) + "..."
          : entry.content,
    }));

    logger.info("Course path data retrieved", {
      userId,
      courseId,
      entriesCount: entriesWithExcerpt.length,
    });

    const data: CoursePathData = {
      courseName: course.name,
      courseType: course.type,
      startedAt: userCourse?.startedAt ?? null,
      completedAt: userCourse?.completedAt ?? null,
      entries: entriesWithExcerpt,
    };

    return { success: true, data };
  } catch (error) {
    logger.error("Failed to get course path data", error as Error, { userId, courseId });
    return { success: false, error: "Не удалось получить данные пути" };
  }
}

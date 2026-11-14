/**
 * Сервис сбора данных для экспорта «Ваш путь» (PDF).
 * Проверка доступа и сбор курса, дневника, дат — в core.
 */

import { createWebLogger } from "@gafus/logger";

import { getDiaryEntries } from "../diary";
import type { DiaryPersistencePort } from "../diary";

import type { CoursePathData, CoursePathEntry } from "./types";

const logger = createWebLogger("core-course-path");

const EXCERPT_LENGTH = 250;

/** SQL/entitlement reads are supplied by an outer composition root. Core must
 * not select course rows or reveal diary content before checking viewer access. */
export interface CoursePathReadPorts {
  checkCourseAccess: (courseId: string, viewerId: string) => Promise<{ hasAccess: boolean }>;
  readCoursePathHeader: (courseId: string) => Promise<{ name: string; type: string } | null>;
  readOwnedCoursePathProgress: (viewerId: string, courseId: string) => Promise<{
    startedAt: Date | null;
    completedAt: Date | null;
  } | null>;
}

export async function getCoursePathData(
  diaryPersistence: DiaryPersistencePort,
  userId: string,
  courseId: string,
  reads: CoursePathReadPorts,
): Promise<{ success: true; data: CoursePathData } | { success: false; error: string }> {
  try {
    const { hasAccess } = await reads.checkCourseAccess(courseId, userId);
    if (!hasAccess) {
      logger.warn("Access denied for course path");
      return { success: false, error: "Нет доступа к курсу" };
    }

    const course = await reads.readCoursePathHeader(courseId);
    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    const diaryResult = await getDiaryEntries(diaryPersistence, userId, courseId);
    if (diaryResult.error) {
      logger.warn("Diary entries error");
      return { success: false, error: diaryResult.error };
    }

    const userCourse = await reads.readOwnedCoursePathProgress(userId, courseId);

    const entriesWithExcerpt: CoursePathEntry[] = diaryResult.entries.map((entry) => ({
      ...entry,
      contentExcerpt:
        entry.content.length > EXCERPT_LENGTH
          ? entry.content.slice(0, EXCERPT_LENGTH) + "..."
          : entry.content,
    }));

    logger.info("Course path data retrieved", {
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
  } catch {
    // Database exceptions may contain owner IDs or diary data; never log raw
    // provider errors in the course-path projection.
    logger.error("Failed to get course path data");
    return { success: false, error: "Не удалось получить данные пути" };
  }
}

/**
 * Хелперы для работы с тренировочными днями.
 */

import { prisma } from "@gafus/prisma";

/**
 * Получает все курсы, которые используют указанный день
 */
export async function getCoursesUsingDay(dayId: string): Promise<string[]> {
  const dayOnCourses = await prisma.dayOnCourse.findMany({
    where: { dayId },
    select: { courseId: true },
  });
  return Array.from(new Set(dayOnCourses.map((doc) => doc.courseId)));
}

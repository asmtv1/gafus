/** Read only course title and caller's own enrollment timeline, never all user progress. */
import { prisma } from "@gafus/prisma";

export async function readCoursePathHeader(courseId: string) {
  if (!courseId) return null;
  return prisma.course.findUnique({
    where: { id: courseId }, select: { name: true, type: true },
  });
}

export async function readOwnedCoursePathProgress(ownerId: string, courseId: string) {
  if (!ownerId || !courseId) return null;
  return prisma.userCourse.findUnique({
    where: { userId_courseId: { userId: ownerId, courseId } },
    select: { startedAt: true, completedAt: true },
  });
}

export async function listCourseIdsForTrainingDay(dayId: string): Promise<string[]> {
  if (!dayId) return [];
  const rows = await prisma.dayOnCourse.findMany({
    where: { dayId }, select: { courseId: true },
  });
  return Array.from(new Set(rows.map((row) => row.courseId)));
}

/**
 * Статистика достижений из БД для API (mobile).
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { getUserTrainingDates } from "./datesService";
import { calculateCurrentStreak, calculateLongestStreak } from "./calculateStreaks";
import {
  calculateAchievements,
  type AchievementStats,
} from "./calculateAchievements";
import type { AchievementData } from "@gafus/types";

const logger = createWebLogger("achievements-stats-service");

/**
 * Возвращает полные данные достижений для пользователя (статистика + список достижений).
 */
export async function getAchievementStats(userId: string): Promise<AchievementData> {
  const [userCourses, completedTrainings, trainingDates] = await Promise.all([
    prisma.userCourse.findMany({
      where: { userId },
      select: { courseId: true, status: true },
    }),
    prisma.userTraining.findMany({
      where: { userId, status: "COMPLETED" },
      include: { dayOnCourse: { select: { courseId: true } } },
    }),
    getUserTrainingDates(userId),
  ]);

  const active = userCourses.filter((uc) => uc.status !== "NOT_STARTED");
  const totalCourses = active.length;
  const completedCourses = userCourses.filter((uc) => uc.status === "COMPLETED").length;
  const inProgressCourses = userCourses.filter(
    (uc) => uc.status === "IN_PROGRESS"
  ).length;

  const totalCompletedDays = completedTrainings.length;
  const startedCourseIds = active.map((uc) => uc.courseId);
  const completedByCourse: Record<string, number> = {};
  for (const t of completedTrainings) {
    const cid = t.dayOnCourse.courseId;
    completedByCourse[cid] = (completedByCourse[cid] ?? 0) + 1;
  }

  let totalDays = 0;
  let averageCourseProgress = 0;

  if (startedCourseIds.length > 0) {
    const dayCounts = await prisma.dayOnCourse.groupBy({
      by: ["courseId"],
      _count: true,
      where: { courseId: { in: startedCourseIds } },
    });
    for (const row of dayCounts) {
      totalDays += row._count;
    }
    const progressSum = dayCounts.reduce((acc, row) => {
      const completed = completedByCourse[row.courseId] ?? 0;
      const total = row._count;
      return acc + (total > 0 ? (completed / total) * 100 : 0);
    }, 0);
    averageCourseProgress =
      dayCounts.length > 0 ? Math.round(progressSum / dayCounts.length) : 0;
  }

  const overallProgress =
    totalDays > 0 ? Math.round((totalCompletedDays / totalDays) * 100) : 0;
  const totalTrainingTime = totalCompletedDays * 30;
  const longestStreak = calculateLongestStreak(trainingDates);
  const currentStreak = calculateCurrentStreak(trainingDates);

  const stats: AchievementStats = {
    totalCourses,
    completedCourses,
    inProgressCourses,
    totalCompletedDays,
    totalDays,
    overallProgress,
    totalTrainingTime,
    averageCourseProgress,
    longestStreak,
    currentStreak,
  };

  const achievements = calculateAchievements(stats);

  logger.info("Achievement stats computed", {
    userId,
    totalCourses,
    completedCourses,
    totalCompletedDays,
    totalDays,
    overallProgress,
  });

  return {
    ...stats,
    achievements,
    lastUpdated: new Date(),
    version: "1.0.0",
  };
}

"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@/utils";

async function findDayOnCourse(courseId: string, day: number) {
  return prisma.dayOnCourse.findFirst({
    where: { courseId, order: day },
    include: {
      day: {
        include: {
          stepLinks: {
            orderBy: { order: "asc" },
            include: { step: true },
          },
        },
      },
    },
  });
}

export async function pauseUserStepServerAction(
  courseId: string,
  day: number,
  stepIndex: number,
  timeLeftSec: number,
): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();

  try {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const dayOnCourse = await findDayOnCourse(courseId, day);
      if (!dayOnCourse?.day) throw new Error("DayOnCourse or day not found");

      const stepLink = dayOnCourse.day.stepLinks[stepIndex];
      if (!stepLink) throw new Error("Step not found by index");

      // Найти/создать UserTraining
      const userTraining =
        (await tx.userTraining.findFirst({
          where: { userId, dayOnCourseId: dayOnCourse.id },
          select: { id: true },
        })) ||
        (await tx.userTraining.create({
          data: { userId, dayOnCourseId: dayOnCourse.id },
          select: { id: true },
        }));

      // Найти/создать UserStep
      const existing = await tx.userStep.findFirst({
        where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
      });

      if (existing) {
        await ((tx as unknown) as { userStep: { update: (args: unknown) => Promise<unknown> } }).userStep.update({
          where: { id: existing.id },
          data: ({} as unknown) as unknown,
        });
        // Обновляем поля паузы через raw, чтобы избежать несовпадения типов клиента до генерации
        await tx.$executeRaw`UPDATE "UserStep" SET "paused" = true, "remainingSec" = ${Math.max(Math.floor(Number(timeLeftSec) || 0), 0)}, "updatedAt" = NOW() WHERE "id" = ${existing.id}`;
      } else {
        // Создаем запись UserStep стандартным путём без новых полей
        await ((tx as unknown) as { userStep: { create: (args: unknown) => Promise<unknown> } }).userStep.create({
          data: ({
            userTrainingId: userTraining.id,
            stepOnDayId: stepLink.id,
            status: 'IN_PROGRESS',
          } as unknown) as unknown,
        });
        // Затем выставляем паузу и оставшееся время
        await tx.$executeRaw`UPDATE "UserStep" SET "paused" = true, "remainingSec" = ${Math.max(Math.floor(Number(timeLeftSec) || 0), 0)}, "updatedAt" = NOW() WHERE "userTrainingId" = ${userTraining.id} AND "stepOnDayId" = ${stepLink.id}`;
      }
    });

    // Инвалидация кэша прогресса пользователя (офлайн-дружелюбная)
    try {
      await invalidateUserProgressCache(userId, false);
    } catch (e) {
      console.warn("pauseUserStepServerAction: cache invalidation skipped", e);
    }

    return { success: true };
  } catch (error) {
    try {
      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : String(error),
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "pauseUserStepServerAction",
          courseId,
          day,
          stepIndex,
          timeLeftSec,
        },
        tags: ["training", "step-pause", "server-action"],
      });
    } catch (e) {
      console.warn("pauseUserStepServerAction: failed to report error", e);
    }
    throw error;
  }
}

export async function resumeUserStepServerAction(
  courseId: string,
  day: number,
  stepIndex: number,
): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();

  try {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const dayOnCourse = await findDayOnCourse(courseId, day);
      if (!dayOnCourse?.day) throw new Error("DayOnCourse or day not found");

      const stepLink = dayOnCourse.day.stepLinks[stepIndex];
      if (!stepLink) throw new Error("Step not found by index");

      const userTraining = await tx.userTraining.findFirst({
        where: { userId, dayOnCourseId: dayOnCourse.id },
        select: { id: true },
      });

      if (!userTraining) {
        // Нечего возобновлять
        return;
      }

      const existing = await tx.userStep.findFirst({
        where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
      });

      if (existing) {
        await ((tx as unknown) as { userStep: { update: (args: unknown) => Promise<unknown> } }).userStep.update({
          where: { id: existing.id },
          data: ({} as unknown) as unknown,
        });
        await tx.$executeRaw`UPDATE "UserStep" SET "paused" = false, "remainingSec" = NULL, "updatedAt" = NOW() WHERE "id" = ${existing.id}`;
      }
    });

    try {
      await invalidateUserProgressCache(userId, false);
    } catch (e) {
      console.warn("resumeUserStepServerAction: cache invalidation skipped", e);
    }

    return { success: true };
  } catch (error) {
    try {
      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : String(error),
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "resumeUserStepServerAction",
          courseId,
          day,
          stepIndex,
        },
        tags: ["training", "step-resume", "server-action"],
      });
    } catch (e) {
      console.warn("resumeUserStepServerAction: failed to report error", e);
    }
    throw error;
  }
}



"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { z } from "zod";

import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@/utils";
import { courseIdSchema, dayNumberSchema, stepIndexSchema } from "../validation/schemas";

const pauseSchema = z.object({
  courseId: courseIdSchema,
  day: dayNumberSchema,
  stepIndex: stepIndexSchema,
  timeLeftSec: z.number().min(0, "Оставшееся время должно быть неотрицательным"),
});

const resumeSchema = z.object({
  courseId: courseIdSchema,
  day: dayNumberSchema,
  stepIndex: stepIndexSchema,
});

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
  const safeInput = pauseSchema.parse({ courseId, day, stepIndex, timeLeftSec });
  const userId = await getCurrentUserId();

  try {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const dayOnCourse = await findDayOnCourse(safeInput.courseId, safeInput.day);
      if (!dayOnCourse?.day) throw new Error("DayOnCourse or day not found");

      const stepLink = dayOnCourse.day.stepLinks[safeInput.stepIndex];
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

      const remaining = Math.max(Math.floor(Number(safeInput.timeLeftSec) || 0), 0);

      if (existing) {
        await tx.userStep.update({
          where: { id: existing.id },
          data: {
            paused: true,
            remainingSec: remaining,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.userStep.create({
          data: {
            userTrainingId: userTraining.id,
            stepOnDayId: stepLink.id,
            paused: true,
            remainingSec: remaining,
          },
        });
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
        courseId: safeInput.courseId,
        day: safeInput.day,
        stepIndex: safeInput.stepIndex,
        timeLeftSec: safeInput.timeLeftSec,
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
  const safeInput = resumeSchema.parse({ courseId, day, stepIndex });
  const userId = await getCurrentUserId();

  try {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const dayOnCourse = await findDayOnCourse(safeInput.courseId, safeInput.day);
      if (!dayOnCourse?.day) throw new Error("DayOnCourse or day not found");

      const stepLink = dayOnCourse.day.stepLinks[safeInput.stepIndex];
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
        await tx.userStep.update({
          where: { id: existing.id },
          data: {
            paused: false,
            remainingSec: null,
            updatedAt: new Date(),
          },
        });
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
          courseId: safeInput.courseId,
          day: safeInput.day,
          stepIndex: safeInput.stepIndex,
        },
        tags: ["training", "step-resume", "server-action"],
      });
    } catch (e) {
      console.warn("resumeUserStepServerAction: failed to report error", e);
    }
    throw error;
  }
}

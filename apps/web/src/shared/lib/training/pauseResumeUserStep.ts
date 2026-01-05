"use server";

import { prisma } from "@gafus/prisma";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@/utils";
import { courseIdSchema, dayIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger('web');

const pauseSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
  stepIndex: stepIndexSchema,
  timeLeftSec: z.number().min(0, "Оставшееся время должно быть неотрицательным"),
});

const resumeSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
  stepIndex: stepIndexSchema,
});

export async function pauseUserStepServerAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  timeLeftSec: number,
): Promise<{ success: boolean }> {
  const safeInput = pauseSchema.parse({ courseId, dayOnCourseId, stepIndex, timeLeftSec });
  const userId = await getCurrentUserId();

  try {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const dayOnCourse = await tx.dayOnCourse.findUnique({
        where: { id: safeInput.dayOnCourseId },
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
      
      if (!dayOnCourse?.day) {
        logger.error("DayOnCourse or day not found", new Error("DayOnCourse or day not found"), {
          operation: "pauseUserStepServerAction",
          courseId: safeInput.courseId,
          dayOnCourseId: safeInput.dayOnCourseId,
          stepIndex: safeInput.stepIndex,
        });
        throw new Error("DayOnCourse or day not found");
      }

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
      logger.warn("pauseUserStepServerAction: cache invalidation skipped", { error: e, operation: 'warn' });
    }

    return { success: true };
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "pauseUserStepServerAction",
        action: "pauseUserStepServerAction",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        timeLeftSec: safeInput.timeLeftSec,
        tags: ["training", "step-pause", "server-action"],
      }
    );
    throw error;
  }
}

export async function resumeUserStepServerAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
): Promise<{ success: boolean }> {
  const safeInput = resumeSchema.parse({ courseId, dayOnCourseId, stepIndex });
  const userId = await getCurrentUserId();

  try {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const dayOnCourse = await tx.dayOnCourse.findUnique({
        where: { id: safeInput.dayOnCourseId },
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
      
      if (!dayOnCourse?.day) {
        logger.error("DayOnCourse or day not found", new Error("DayOnCourse or day not found"), {
          operation: "resumeUserStepServerAction",
          courseId: safeInput.courseId,
          dayOnCourseId: safeInput.dayOnCourseId,
          stepIndex: safeInput.stepIndex,
        });
        throw new Error("DayOnCourse or day not found");
      }

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
      logger.warn("resumeUserStepServerAction: cache invalidation skipped", { error: e, operation: 'warn' });
    }

    return { success: true };
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "resumeUserStepServerAction",
        action: "resumeUserStepServerAction",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        tags: ["training", "step-resume", "server-action"],
      }
    );
    throw error;
  }
}

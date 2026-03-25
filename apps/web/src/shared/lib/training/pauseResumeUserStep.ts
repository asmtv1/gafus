"use server";

import { after } from "next/server";
import { updateStepAndDay } from "@gafus/core/services/training";
import { z } from "zod";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayOnCourseIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger("web");

const pauseSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayOnCourseIdSchema,
  stepIndex: stepIndexSchema,
  timeLeftSec: z.number().min(0, "Оставшееся время должно быть неотрицательным"),
});

const resumeSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayOnCourseIdSchema,
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
    const remaining = Math.max(Math.floor(Number(safeInput.timeLeftSec) || 0), 0);
    await updateStepAndDay(userId, safeInput.dayOnCourseId, safeInput.stepIndex, {
      type: "pause",
      remainingSec: remaining,
    });

    after(() =>
      invalidateUserProgressCache(userId, false).catch((e) => {
        logger.warn("pauseUserStepServerAction: cache invalidation skipped", {
          error: e,
          operation: "warn",
        });
      }),
    );

    return { success: true };
  } catch (error) {
    logger.error(
      getErrorMessage(error),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "pauseUserStepServerAction",
        action: "pauseUserStepServerAction",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        timeLeftSec: safeInput.timeLeftSec,
        tags: ["training", "step-pause", "server-action"],
      },
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
    await updateStepAndDay(userId, safeInput.dayOnCourseId, safeInput.stepIndex, {
      type: "resume",
    });

    after(() =>
      invalidateUserProgressCache(userId, false).catch((e) => {
        logger.warn("resumeUserStepServerAction: cache invalidation skipped", {
          error: e,
          operation: "warn",
        });
      }),
    );

    return { success: true };
  } catch (error) {
    logger.error(
      getErrorMessage(error),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "resumeUserStepServerAction",
        action: "resumeUserStepServerAction",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        tags: ["training", "step-resume", "server-action"],
      },
    );
    throw error;
  }
}

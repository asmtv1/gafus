"use server";

import { getCurrentUserId } from "@/utils";
import {
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
} from "@shared/lib/StepNotification/manageStepNotification";
import { courseIdSchema, dayNumberSchema, stepIndexSchema, positiveDurationSchema } from "@shared/lib/validation/schemas";
import { z } from "zod";

const notificationKeySchema = z.object({
  courseId: courseIdSchema,
  day: dayNumberSchema,
  stepIndex: stepIndexSchema,
});

const resumeNotificationSchema = notificationKeySchema.extend({
  durationSec: positiveDurationSchema,
});

export async function pauseNotificationAction(courseId: string, day: number, stepIndex: number) {
  const parsed = notificationKeySchema.parse({ courseId, day, stepIndex });
  try {
    const userId = await getCurrentUserId();

    await pauseStepNotification(userId, parsed.day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    console.error("Failed to pause notification:", error);
    throw new Error("Failed to pause notification");
  }
}

export async function resetNotificationAction(courseId: string, day: number, stepIndex: number) {
  const parsed = notificationKeySchema.parse({ courseId, day, stepIndex });
  try {
    const userId = await getCurrentUserId();

    await resetStepNotification(userId, parsed.day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    console.error("Failed to reset notification:", error);
    throw new Error("Failed to reset notification");
  }
}

export async function resumeNotificationAction(
  courseId: string,
  day: number,
  stepIndex: number,
  durationSec: number,
) {
  const parsed = resumeNotificationSchema.parse({ courseId, day, stepIndex, durationSec });
  try {
    const userId = await getCurrentUserId();

    await resumeStepNotification(userId, parsed.day, parsed.stepIndex, parsed.durationSec);
    return { success: true };
  } catch (error) {
    console.error("Failed to resume notification:", error);
    throw new Error("Failed to resume notification");
  }
}

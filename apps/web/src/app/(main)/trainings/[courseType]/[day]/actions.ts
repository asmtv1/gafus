"use server";

import { getCurrentUserId } from "@/utils";
import {
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
} from "@shared/lib/StepNotification/manageStepNotification";

export async function pauseNotificationAction(courseId: string, day: number, stepIndex: number) {
  try {
    const userId = await getCurrentUserId();

    if (!courseId || day === undefined || stepIndex === undefined) {
      throw new Error("Missing required fields: courseId, day, stepIndex");
    }

    await pauseStepNotification(userId, day, stepIndex);
    return { success: true };
  } catch (error) {
    console.error("Failed to pause notification:", error);
    throw new Error("Failed to pause notification");
  }
}

export async function resetNotificationAction(courseId: string, day: number, stepIndex: number) {
  try {
    const userId = await getCurrentUserId();

    if (!courseId || day === undefined || stepIndex === undefined) {
      throw new Error("Missing required fields: courseId, day, stepIndex");
    }

    await resetStepNotification(userId, day, stepIndex);
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
  try {
    const userId = await getCurrentUserId();

    if (!courseId || day === undefined || stepIndex === undefined || !durationSec) {
      throw new Error("Missing required fields: courseId, day, stepIndex, durationSec");
    }

    await resumeStepNotification(userId, day, stepIndex, durationSec);
    return { success: true };
  } catch (error) {
    console.error("Failed to resume notification:", error);
    throw new Error("Failed to resume notification");
  }
}

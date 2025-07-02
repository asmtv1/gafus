"use server";

import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { updateUserStepStatus } from "./updateUserStepStatus";
import { createStepNotificationsForUserStep } from "@/lib/StepNotification/createStepNotification";
import { TrainingStatus } from "@gafus/types";

export async function startUserStepServerAction(
  courseType: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus,
  durationSec: number
) {
  const userId = await getCurrentUserId();

  await updateUserStepStatus(userId, courseType, day, stepIndex, status);
  await createStepNotificationsForUserStep({
    userId,
    day,
    stepIndex,
    durationSec: durationSec,
    maybeUrl: "", // ссылка, если нужна
  });

  return { success: true };
}

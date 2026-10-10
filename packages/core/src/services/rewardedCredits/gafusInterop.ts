import { prisma } from "@gafus/prisma";
import { hasActiveGafusCourseStepAccess } from "../contentAccess";

type AccessRequest = { userId: string; now?: Date };

export async function hasGafusUnlockForUserStep(input: AccessRequest & { userStepId: string }) {
  const step = await prisma.userStep.findFirst({
    where: { id: input.userStepId, userTraining: { userId: input.userId } },
    select: {
      stepOnDayId: true,
      userTraining: { select: { dayOnCourseId: true } },
    },
  });
  if (!step?.userTraining?.dayOnCourseId) return false;
  return hasActiveGafusCourseStepAccess({
    userId: input.userId,
    dayOnCourseId: step.userTraining.dayOnCourseId,
    stepOnDayId: step.stepOnDayId,
    now: input.now,
  });
}

export async function hasGafusUnlockForVideoUrl(input: AccessRequest & { videoUrl: string }) {
  // The same source video can be reused across courses; any active authorized
  // occurrence permits playback, but another user's unlock never does.
  const steps = await prisma.userStep.findMany({
    where: {
      userTraining: { userId: input.userId },
      stepOnDay: { step: { videoUrl: input.videoUrl } },
    },
    select: {
      stepOnDayId: true,
      userTraining: { select: { dayOnCourseId: true } },
    },
  });
  for (const step of steps) {
    if (await hasActiveGafusCourseStepAccess({
      userId: input.userId,
      dayOnCourseId: step.userTraining.dayOnCourseId,
      stepOnDayId: step.stepOnDayId,
      now: input.now,
    })) return true;
  }
  return false;
}

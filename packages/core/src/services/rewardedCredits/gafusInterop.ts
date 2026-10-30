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

/** Media rights are derived from the course occurrence, not an already
 * created UserTraining/UserStep row. Reading video must work immediately after
 * Gafus purchase, before the user starts the exercise. */
export async function findGafusUnlockedStepForVideoUrl(
  input: AccessRequest & { videoUrl: string },
): Promise<string | null> {
  const occurrences = await prisma.dayOnCourse.findMany({
    where: { day: { stepLinks: { some: { step: { videoUrl: input.videoUrl } } } } },
    select: {
      id: true,
      day: {
        select: {
          stepLinks: {
            where: { step: { videoUrl: input.videoUrl } },
            select: { id: true },
          },
        },
      },
    },
  });
  for (const occurrence of occurrences) {
    for (const step of occurrence.day.stepLinks) {
      if (await hasActiveGafusCourseStepAccess({
        userId: input.userId,
        dayOnCourseId: occurrence.id,
        stepOnDayId: step.id,
        now: input.now,
      })) return step.id;
    }
  }
  return null;
}

export async function hasGafusUnlockForVideoUrl(input: AccessRequest & { videoUrl: string }) {
  return (await findGafusUnlockedStepForVideoUrl(input)) !== null;
}

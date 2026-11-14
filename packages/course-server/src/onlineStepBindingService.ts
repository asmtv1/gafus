/** Read-only SQL adapter. Read ACLs are already enforced in the Hono
 * application handler before this web-only projection runs.
 * This module cannot mutate progress or create a training enrollment. */
import { prisma } from "@gafus/prisma";
import type { TrainingDetail } from "@gafus/types";
import {
  onlineStepOccurrencesMatch,
  projectOnlineStepBinding,
} from "@gafus/core/services/training";

export async function withOnlineStepBinding(
  userId: string,
  dayOnCourseId: string,
  detail: TrainingDetail,
) {
  const links = await prisma.stepOnDay.findMany({
    where: { dayId: detail.trainingDayId },
    select: { id: true, stepId: true, order: true },
    orderBy: { order: "asc" },
  });
  if (!onlineStepOccurrencesMatch(detail, links)) return detail;
  const existingTraining = await prisma.userTraining.findUnique({
    where: { userId_dayOnCourseId: { userId, dayOnCourseId } },
    select: { id: true },
  });
  const progress = existingTraining
    ? await prisma.userStep.findMany({
        where: {
          userTrainingId: existingTraining.id,
          stepOnDayId: { in: links.map((link) => link.id) },
        },
        select: {
          stepOnDayId: true,
          status: true,
          paused: true,
          remainingSec: true,
          updatedAt: true,
        },
      })
    : [];
  return projectOnlineStepBinding(detail, links, progress, new Date());
}

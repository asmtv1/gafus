/** Read-only, opt-in Web training timer projection. Native DTOs stay unchanged.
 * Mismatched physical occurrences or concurrent progress writes fail closed to
 * the original DTO. All access checks happen in the caller's application service.
 */
import { prisma } from "@gafus/prisma";
import type { TrainingDetail } from "@gafus/types";

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
  const matches =
    links.length === detail.steps.length &&
    links.every(
      (link, i) => link.stepId === detail.steps[i]?.id && link.order === detail.steps[i]?.order,
    );
  if (!matches) return detail;

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
  const byOccurrence = new Map(progress.map((row) => [row.stepOnDayId, row]));
  const serverNow = new Date();
  const coherent = links.every((link, i) => {
    const step = detail.steps[i];
    const state = byOccurrence.get(link.id);
    return (
      !step ||
      step.locked ||
      !state ||
      (state.status === step.status &&
        state.paused === Boolean(step.isPausedOnServer) &&
        (state.remainingSec ?? null) === (step.remainingSecOnServer ?? null))
    );
  });
  if (!coherent) return detail;

  return {
    ...detail,
    serverNow: serverNow.toISOString(),
    onlineStepBinding: "STEP_ON_DAY_ID_V1" as const,
    steps: detail.steps.map((step, i) => {
      if (step.locked) return step;
      const occurrenceId = links[i].id;
      const state = byOccurrence.get(occurrenceId);
      const running =
        step.status === "IN_PROGRESS" && !state?.paused && typeof state?.remainingSec === "number";
      const expiresAt = running
        ? new Date(state.updatedAt.getTime() + Math.max(0, state.remainingSec ?? 0) * 1000)
        : null;
      const remaining =
        step.status === "IN_PROGRESS" && typeof state?.remainingSec === "number"
          ? expiresAt
            ? Math.max(0, Math.ceil((expiresAt.getTime() - serverNow.getTime()) / 1000))
            : Math.max(0, state.remainingSec)
          : null;
      return {
        ...step,
        stepOnDayId: occurrenceId,
        timerSnapshot: {
          remainingSecAtServerNow: remaining,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      };
    }),
  };
}

/** Pure, side-effect-free projection of an already ACL-checked course day.
 * Never derive server-side state for a mismatched physical step occurrence.
 * The repository queries live exclusively in course-server. */
import type { TrainingDetail } from "@gafus/types";

export type OnlineStepOccurrence = {
  id: string;
  stepId: string;
  order: number;
};
export type OnlineStepProgress = {
  stepOnDayId: string;
  status: string;
  paused: boolean;
  remainingSec: number | null;
  updatedAt: Date;
};

export function onlineStepOccurrencesMatch(
  detail: TrainingDetail,
  links: readonly OnlineStepOccurrence[],
): boolean {
  return links.length === detail.steps.length &&
    links.every((link, index) =>
      link.stepId === detail.steps[index]?.id &&
      link.order === detail.steps[index]?.order);
}

export function projectOnlineStepBinding(
  detail: TrainingDetail,
  links: readonly OnlineStepOccurrence[],
  progress: readonly OnlineStepProgress[],
  serverNow = new Date(),
) {
  if (!onlineStepOccurrencesMatch(detail, links)) return detail;
  const byOccurrence = new Map(progress.map((row) => [row.stepOnDayId, row]));
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
      const occurrenceId = links[i]!.id;
      const state = byOccurrence.get(occurrenceId);
      const running =
        step.status === "IN_PROGRESS" && !state?.paused &&
        typeof state?.remainingSec === "number";
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

/** Existing learner training step write port. Guard and effects remain in HTTP. */
import type { updateStepAndDay } from "@gafus/core/services/training";

export function createWriteStepProgressApplication(dependencies: {
  updateStep: typeof updateStepAndDay;
}) {
  return {
    execute(
      actorUserId: Parameters<typeof updateStepAndDay>[0],
      dayOnCourseId: Parameters<typeof updateStepAndDay>[1],
      stepIndex: Parameters<typeof updateStepAndDay>[2],
      operation: Parameters<typeof updateStepAndDay>[3],
      binding?: Parameters<typeof updateStepAndDay>[4],
    ): ReturnType<typeof updateStepAndDay> {
      return binding === undefined
        ? dependencies.updateStep(actorUserId, dayOnCourseId, stepIndex, operation)
        : dependencies.updateStep(actorUserId, dayOnCourseId, stepIndex, operation, binding);
    },
  };
}

/** Existing learner training step write port. Guard and effects remain in HTTP. */
import type { TrainingServiceApi } from "@gafus/core/services/training";

export function createWriteStepProgressApplication(dependencies: {
  updateStep: TrainingServiceApi["updateStepAndDay"];
}) {
  return {
    execute(
      actorUserId: Parameters<TrainingServiceApi["updateStepAndDay"]>[0],
      dayOnCourseId: Parameters<TrainingServiceApi["updateStepAndDay"]>[1],
      stepIndex: Parameters<TrainingServiceApi["updateStepAndDay"]>[2],
      operation: Parameters<TrainingServiceApi["updateStepAndDay"]>[3],
      binding?: Parameters<TrainingServiceApi["updateStepAndDay"]>[4],
    ): ReturnType<TrainingServiceApi["updateStepAndDay"]> {
      return binding === undefined
        ? dependencies.updateStep(actorUserId, dayOnCourseId, stepIndex, operation)
        : dependencies.updateStep(actorUserId, dayOnCourseId, stepIndex, operation, binding);
    },
  };
}

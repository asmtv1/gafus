/** Existing learner /day (optionally writing) and step-command Core ports. */
import type {
  getDailyCourseDayWithUserSteps,
  updateDailyCourseStepAndDay,
} from "@gafus/core/services/dailyCourse";

export function createDayAndStepCommandsApplication(dependencies: {
  readOrCreateDay: typeof getDailyCourseDayWithUserSteps;
  updateStep: typeof updateDailyCourseStepAndDay;
}) {
  return {
    getDay(
      actorUserId: string,
      scheduleId: string,
      options: Parameters<typeof getDailyCourseDayWithUserSteps>[2],
    ): ReturnType<typeof getDailyCourseDayWithUserSteps> {
      return dependencies.readOrCreateDay(actorUserId, scheduleId, options);
    },
    updateStep(
      actorUserId: string,
      scheduleId: string,
      stepIndex: number,
      operation: Parameters<typeof updateDailyCourseStepAndDay>[3],
      binding?: Parameters<typeof updateDailyCourseStepAndDay>[4],
    ): ReturnType<typeof updateDailyCourseStepAndDay> {
      return binding
        ? dependencies.updateStep(actorUserId, scheduleId, stepIndex, operation, binding)
        : dependencies.updateStep(actorUserId, scheduleId, stepIndex, operation);
    },
  };
}

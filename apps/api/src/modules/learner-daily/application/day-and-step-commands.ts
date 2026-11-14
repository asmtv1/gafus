/** Existing learner /day (optionally writing) and step-command Core ports. */
import type { createDailyCourseService } from "@gafus/course-progress-server/daily-course-service";

type DailyCourseReadDay = ReturnType<typeof createDailyCourseService>["getDailyCourseDayWithUserSteps"];
type DailyCourseWriteStep = ReturnType<typeof createDailyCourseService>["updateDailyCourseStepAndDay"];

export function createDayAndStepCommandsApplication(dependencies: {
  readOrCreateDay: DailyCourseReadDay;
  updateStep: DailyCourseWriteStep;
}) {
  return {
    getDay(
      actorUserId: string,
      scheduleId: string,
      options: Parameters<DailyCourseReadDay>[2],
    ): ReturnType<DailyCourseReadDay> {
      return dependencies.readOrCreateDay(actorUserId, scheduleId, options);
    },
    updateStep(
      actorUserId: string,
      scheduleId: string,
      stepIndex: number,
      operation: Parameters<DailyCourseWriteStep>[3],
      binding?: Parameters<DailyCourseWriteStep>[4],
    ): ReturnType<DailyCourseWriteStep> {
      return binding
        ? dependencies.updateStep(actorUserId, scheduleId, stepIndex, operation, binding)
        : dependencies.updateStep(actorUserId, scheduleId, stepIndex, operation);
    },
  };
}

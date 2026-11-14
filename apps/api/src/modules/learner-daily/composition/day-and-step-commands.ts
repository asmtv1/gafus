import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** Existing learner Core bindings; no read or write runs on composition creation. */
import {
  getDailyCourseDayWithUserSteps,
  updateDailyCourseStepAndDay,
} from "../../daily-course/composition/dailyCourseApplication.js";
import { createDayAndStepCommandsApplication } from "../application/day-and-step-commands.js";

export const dayAndStepCommandsApplication = createDayAndStepCommandsApplication({
  readOrCreateDay: (actorUserId, scheduleId, options) =>
    withCorrelatedUseCase("learner.daily.day.read_or_create", () => getDailyCourseDayWithUserSteps(actorUserId, scheduleId, options)),
  updateStep: (...args) => withCorrelatedUseCase("learner.daily.step.update", () => updateDailyCourseStepAndDay(...args)),
});

/** Existing learner Core bindings; no read or write runs on composition creation. */
import {
  getDailyCourseDayWithUserSteps,
  updateDailyCourseStepAndDay,
} from "@gafus/core/services/dailyCourse";
import { createDayAndStepCommandsApplication } from "../application/day-and-step-commands.js";

export const dayAndStepCommandsApplication = createDayAndStepCommandsApplication({
  readOrCreateDay: (actorUserId, scheduleId, options) =>
    getDailyCourseDayWithUserSteps(actorUserId, scheduleId, options),
  updateStep: updateDailyCourseStepAndDay,
});

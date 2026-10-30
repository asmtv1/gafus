/**
 * AG1-001 composition root for existing monetized day and fallback access.
 */
import { checkCourseAccess } from "@gafus/core/services/course";
import { getTrainingDayWithMonetizedSteps } from "@gafus/core/services/training";
import { createReadTrainingDayApplication } from "../application/read-training-day.js";

export const readTrainingDayApplication = createReadTrainingDayApplication({
  readDay: getTrainingDayWithMonetizedSteps,
  checkAccess: checkCourseAccess,
});

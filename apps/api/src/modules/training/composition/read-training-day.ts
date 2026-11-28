import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/**
 * AG1-001 composition root for existing monetized day and fallback access.
 */
import { checkCourseAccess } from "../../courses/composition/catalog-read-instance.js";
import { sqlTraining } from "./sql-training-instance.js";
import { createReadTrainingDayApplication } from "../application/read-training-day.js";

export const readTrainingDayApplication = createReadTrainingDayApplication({
  readDay: (...args) => withCorrelatedUseCase("training.day.detail.read", () => sqlTraining.getTrainingDayWithMonetizedSteps(...args)),
  checkAccess: (...args) => withCorrelatedUseCase("training.day.access.read", () => checkCourseAccess(...args)),
});

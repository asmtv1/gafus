/** Explicit per-app binding. The Hono routes do not read the Core service registry. */
import { createTrainingRoutes } from "../../../routes/v1/training.js";
import { createReadTrainingDaysApplication } from "../application/read-training-days.js";
import { createReadTrainingDayApplication } from "../application/read-training-day.js";
import { createWriteStepProgressApplication } from "../application/write-step-progress.js";
import { checkCourseAccess } from "../../courses/composition/catalog-read-instance.js";
import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
import type { TrainingRoutesPorts } from "../../../routes/v1/training.js";

export function createApiTrainingRoutes(training: Pick<TrainingRoutesPorts,
  "requireCourseStepOperationAccess" | "validateTheoryStepForCompletion"> & {
    getTrainingDays: Parameters<typeof createReadTrainingDaysApplication>[0]["readDays"];
    getTrainingDayWithMonetizedSteps: Parameters<typeof createReadTrainingDayApplication>[0]["readDay"];
    updateStepAndDay: Parameters<typeof createWriteStepProgressApplication>[0]["updateStep"];
  }) {
  return createTrainingRoutes({
    requireCourseStepOperationAccess: training.requireCourseStepOperationAccess,
    validateTheoryStepForCompletion: training.validateTheoryStepForCompletion,
    readTrainingDaysApplication: createReadTrainingDaysApplication({
      readDays: (...args) => withCorrelatedUseCase("training.days.list.read", () => training.getTrainingDays(...args)),
    }),
    readTrainingDayApplication: createReadTrainingDayApplication({
      readDay: (...args) => withCorrelatedUseCase("training.day.detail.read", () => training.getTrainingDayWithMonetizedSteps(...args)),
      checkAccess: (...args) => withCorrelatedUseCase("training.day.access.read", () => checkCourseAccess(...args)),
    }),
    writeStepProgressApplication: createWriteStepProgressApplication({
      updateStep: (...args) => withCorrelatedUseCase("training.step_progress.update", () => training.updateStepAndDay(...args)),
    }),
  });
}

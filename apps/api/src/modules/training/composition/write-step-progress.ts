import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** Core binding for existing training step writes; no invocation during creation. */
import { updateStepAndDay } from "@gafus/core/services/training";
import { createWriteStepProgressApplication } from "../application/write-step-progress.js";

export const writeStepProgressApplication = createWriteStepProgressApplication({
  updateStep: (...args) => withCorrelatedUseCase("training.step_progress.update", () => updateStepAndDay(...args)),
});

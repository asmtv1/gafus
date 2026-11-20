import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001/TR013: lazy forwarding to the existing Core visible steps getter. */
import { getVisibleSteps, type TrainerStepRowsPort } from "@gafus/core/services/trainerStep";
import { createReadVisibleStepsApplication } from "../application/read-visible-steps.js";

export function createVisibleStepsApplicationForRows(rowsPort?: TrainerStepRowsPort) {
 return createReadVisibleStepsApplication({
  readSteps: (actorUserId, allowMixed, options) =>
    withCorrelatedUseCase("trainer.steps.visible.read", () => rowsPort
      ? getVisibleSteps(actorUserId, allowMixed, options, rowsPort)
      : getVisibleSteps(actorUserId, allowMixed, options)),
 });
}
export const readVisibleStepsApplication = createVisibleStepsApplicationForRows();

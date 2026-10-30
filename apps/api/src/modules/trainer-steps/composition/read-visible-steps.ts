/** AG1-001/TR013: lazy forwarding to the existing Core visible steps getter. */
import { getVisibleSteps } from "@gafus/core/services/trainerStep";
import { createReadVisibleStepsApplication } from "../application/read-visible-steps.js";

export const readVisibleStepsApplication = createReadVisibleStepsApplication({
  readSteps: (actorUserId, allowMixed, options) =>
    getVisibleSteps(actorUserId, allowMixed, options),
});

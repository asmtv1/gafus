import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001: deferred forwarding of the approved Core visible-days getter. */
import { getVisibleDays, type TrainingDayRowsPort } from "@gafus/core/services/trainingDay";
import { createReadVisibleDaysApplication } from "../application/read-visible-days.js";

export function createReadVisibleDaysApplicationForRows(rowsPort?: TrainingDayRowsPort) {
  return createReadVisibleDaysApplication({
    readVisibleDays: (actorUserId, elevated) => withCorrelatedUseCase(
      "trainer.days.visible.read", () => rowsPort
        ? getVisibleDays(actorUserId, elevated, rowsPort)
        : getVisibleDays(actorUserId, elevated),
    ),
  });
}
export const readVisibleDaysApplication = createReadVisibleDaysApplicationForRows();

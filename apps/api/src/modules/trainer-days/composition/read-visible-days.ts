/** AG1-001: deferred forwarding of the approved Core visible-days getter. */
import { getVisibleDays } from "@gafus/core/services/trainingDay";
import { createReadVisibleDaysApplication } from "../application/read-visible-days.js";

export const readVisibleDaysApplication = createReadVisibleDaysApplication({
  readVisibleDays: (actorUserId, elevated) => getVisibleDays(actorUserId, elevated),
});

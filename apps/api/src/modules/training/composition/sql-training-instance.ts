import { getPremiumOrRewardedAccess, requirePremiumOrRewardedUnlock } from "../../rewarded-credits/composition/gafus-access.js";
import { checkCourseAccess, checkCourseAccessById } from "../../courses/composition/catalog-read-instance.js";
/** Exact SQL-backed training service owned by API composition.
 * Importing this module has no registration side effects. */
import { getCoreTrainingDependencies, getTrainingDayContent } from "@gafus/core/services/training";
import { contentRevisionReadPort, dayContentReadPort } from "./training-content-rows-instance.js";
import { createTrainingService } from "@gafus/course-progress-server/training-service";
import { hasActiveGafusCourseStepAccess } from "@gafus/core/services/contentAccess";
import { occurrenceReadPort } from "../../content-access/composition/occurrence-reads-instance.js";
export const sqlTraining = createTrainingService({
  ...getCoreTrainingDependencies({ checkCourseAccess, checkCourseAccessById, getPremiumOrRewardedAccess, requirePremiumOrRewardedUnlock }),
  hasActiveGafusCourseStepAccess: (input) => hasActiveGafusCourseStepAccess(input, occurrenceReadPort),
  getTrainingDayContent: (courseType, dayOnCourseId) =>
    getTrainingDayContent(courseType, dayOnCourseId, {
      contentRows: dayContentReadPort,
      revisionRows: contentRevisionReadPort,
    }),
});

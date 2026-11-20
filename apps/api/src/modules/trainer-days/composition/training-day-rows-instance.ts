/** Atomic trainer day mutation projection. Persistence verifies author and
 * step ownership within the same DB transaction as each insert/replace/delete.
 * Core handles cache/revision invalidation and public ActionResult contracts.
 */
import { type TrainingDayRowsPort } from "@gafus/core/services/trainingDay";
import {
  readTrainingDayForEdit, insertTrainingDay, replaceTrainingDay,
  deleteTrainingDayRows, listVisibleTrainingDays,
} from "@gafus/course-progress-server/training-day-rows";

export const trainingDayRows: TrainingDayRowsPort = {
  readTrainingDayForEdit, insertTrainingDay, replaceTrainingDay,
  deleteTrainingDayRows, listVisibleTrainingDays,
};

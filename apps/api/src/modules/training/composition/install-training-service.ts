/** Keep all training ACL/premium/entitlement dependencies in Core, but compose
 * the existing SQL-backed progress implementation in the API application layer.
 * No changes to underlying progress transactions or occurrence CAS semantics. */
import {
  getCoreTrainingDependencies, registerTrainingServicePort, type TrainingServiceApi,
} from "@gafus/core/services/training";
import { createTrainingService } from "@gafus/course-progress-server/training-service";

const sqlTraining = createTrainingService(getCoreTrainingDependencies());
// Prisma TransactionClient remains opaque in Core. The exact transaction
// object is forwarded unchanged; only the declaration crosses the boundary.
registerTrainingServicePort({
  ...sqlTraining,
  applyStepAndDayTx: sqlTraining.applyStepAndDayTx as unknown as TrainingServiceApi["applyStepAndDayTx"],
  syncUserCourseStatusFromDaysTx: sqlTraining.syncUserCourseStatusFromDaysTx as unknown as TrainingServiceApi["syncUserCourseStatusFromDaysTx"],
});

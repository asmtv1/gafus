/** Keep all training ACL/premium/entitlement dependencies in Core, but compose
 * the existing SQL-backed progress implementation in the API application layer.
 * All online/offline progress writes reconcile the course in one SQL transaction. */
import { registerTrainingServicePort, type TrainingServiceApi } from "@gafus/core/services/training";
import { sqlTraining } from "./sql-training-instance.js";
// Legacy shim retained for isolated Core compatibility tests. The production
// API no longer imports this file or registers a process-global training port.
export { sqlTraining };
// Prisma TransactionClient remains opaque in Core. The exact transaction
// object is forwarded unchanged; only the declaration crosses the boundary.
registerTrainingServicePort({
  ...sqlTraining,
  applyStepAndDayTx: sqlTraining.applyStepAndDayTx as unknown as TrainingServiceApi["applyStepAndDayTx"],
  applyStepDayAndCourseTx: sqlTraining.applyStepDayAndCourseTx as unknown as TrainingServiceApi["applyStepDayAndCourseTx"],
  syncUserCourseStatusFromDaysTx: sqlTraining.syncUserCourseStatusFromDaysTx as unknown as TrainingServiceApi["syncUserCourseStatusFromDaysTx"],
});

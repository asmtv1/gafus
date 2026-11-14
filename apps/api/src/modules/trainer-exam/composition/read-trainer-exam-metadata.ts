import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001: lazy binding to the already-approved Core exam READ getters. */
import { getExamResults, getPendingExamResults } from "@gafus/exam-server/exam-service";
import { createReadTrainerExamMetadataApplication } from "../application/read-trainer-exam-metadata.js";

export const readTrainerExamMetadataApplication = createReadTrainerExamMetadataApplication({
  examResults: (actorUserId, options, isAdmin) => withCorrelatedUseCase("trainer.exam.results.read", () => getExamResults(actorUserId, options, isAdmin)),
  pendingExamResults: (actorUserId, isAdmin) => withCorrelatedUseCase("trainer.exam.pending.read", () => getPendingExamResults(actorUserId, isAdmin)),
});

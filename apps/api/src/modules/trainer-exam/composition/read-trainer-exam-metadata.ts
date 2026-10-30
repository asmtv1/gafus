/** AG1-001: lazy binding to the already-approved Core exam READ getters. */
import { getExamResults, getPendingExamResults } from "@gafus/core/services/exam";
import { createReadTrainerExamMetadataApplication } from "../application/read-trainer-exam-metadata.js";

export const readTrainerExamMetadataApplication = createReadTrainerExamMetadataApplication({
  examResults: (actorUserId, options, isAdmin) => getExamResults(actorUserId, options, isAdmin),
  pendingExamResults: (actorUserId, isAdmin) => getPendingExamResults(actorUserId, isAdmin),
});

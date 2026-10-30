/** AG1-001/LEARN032: lazy original Core getExamResult binding only. */
import { getExamResult } from "@gafus/core/services/exam";
import { createReadExamResultApplication } from "../application/read-result.js";

export const readExamResultApplication = createReadExamResultApplication({
  readResult: (actorUserId, userStepId) => getExamResult(actorUserId, userStepId),
});

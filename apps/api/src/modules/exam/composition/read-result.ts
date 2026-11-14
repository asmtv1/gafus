import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001/LEARN032: lazy original Core getExamResult binding only. */
import { getExamResult } from "@gafus/exam-server/exam-service";
import { createReadExamResultApplication } from "../application/read-result.js";

export const readExamResultApplication = createReadExamResultApplication({
  readResult: (actorUserId, userStepId) => withCorrelatedUseCase("exam.learner.result.read", () => getExamResult(actorUserId, userStepId)),
});

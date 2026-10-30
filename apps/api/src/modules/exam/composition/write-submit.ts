/** AG1-001/LEARN032: deferred exact Core submit binding, no access policy here. */
import { submitExamResult } from "@gafus/core/services/exam";
import { createWriteExamSubmitApplication } from "../application/write-submit.js";

export const writeExamSubmitApplication = createWriteExamSubmitApplication({
  submit: (actorUserId, data) => submitExamResult(actorUserId, data),
});

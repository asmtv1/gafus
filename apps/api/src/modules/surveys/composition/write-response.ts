/** Deferred survey write binding; never submits at composition initialization. */
import { submitSurveyResponse } from "@gafus/core/services/survey";
import { createWriteSurveyResponseApplication } from "../application/write-response.js";

export const writeSurveyResponseApplication = createWriteSurveyResponseApplication({
  submit: (actorUserId, input) => submitSurveyResponse(actorUserId, input),
});

/** Deferred survey write binding; never submits at composition initialization. */
import { submitSurveyResponse } from "./survey-rows.js";
import { createWriteSurveyResponseApplication } from "../application/write-response.js";

export const writeSurveyResponseApplication = createWriteSurveyResponseApplication({
  submit: (actorUserId, input) => submitSurveyResponse(actorUserId, input),
});

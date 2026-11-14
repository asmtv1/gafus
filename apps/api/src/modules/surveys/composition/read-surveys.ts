/** Lazy Core READ bindings: no survey lookups during composition initialization. */
import { getSurveyTemplate } from "@gafus/core/services/survey";
import {
  getSurveyComparison, getSurveyResponse,
} from "./survey-rows.js";
import { createReadSurveysApplication } from "../application/read-surveys.js";

export const readSurveysApplication = createReadSurveysApplication({
  comparison: (actorUserId, courseId, familySlug) =>
    getSurveyComparison(actorUserId, courseId, familySlug),
  template: (slug) => getSurveyTemplate(slug),
  response: (actorUserId, stepId) => getSurveyResponse(actorUserId, stepId),
});

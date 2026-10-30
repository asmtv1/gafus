/** Lazy Core READ bindings: no survey lookups during composition initialization. */
import {
  getSurveyComparison,
  getSurveyResponse,
  getSurveyTemplate,
} from "@gafus/core/services/survey";
import { createReadSurveysApplication } from "../application/read-surveys.js";

export const readSurveysApplication = createReadSurveysApplication({
  comparison: (actorUserId, courseId, familySlug) =>
    getSurveyComparison(actorUserId, courseId, familySlug),
  template: (slug) => getSurveyTemplate(slug),
  response: (actorUserId, stepId) => getSurveyResponse(actorUserId, stepId),
});

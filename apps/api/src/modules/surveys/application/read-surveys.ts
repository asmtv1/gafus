/** Existing survey READ lookups. All private queries and survey rules stay in Core. */
import type {
  getSurveyComparison,
  getSurveyResponse,
  getSurveyTemplate,
} from "@gafus/core/services/survey";

export function createReadSurveysApplication(dependencies: {
  comparison: typeof getSurveyComparison;
  template: typeof getSurveyTemplate;
  response: typeof getSurveyResponse;
}) {
  return {
    getComparison(
      actorUserId: string,
      courseId: string,
      familySlug: string,
    ): ReturnType<typeof getSurveyComparison> {
      return dependencies.comparison(actorUserId, courseId, familySlug);
    },
    getTemplate(slug: string): ReturnType<typeof getSurveyTemplate> {
      return dependencies.template(slug);
    },
    getResponse(actorUserId: string, stepId: string): ReturnType<typeof getSurveyResponse> {
      return dependencies.response(actorUserId, stepId);
    },
  };
}

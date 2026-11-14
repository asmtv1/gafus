/** API application receives only the unchanged actor-scoped public signatures. */
import type {
  getSurveyComparison, getSurveyResponse, getSurveyTemplate,
} from "@gafus/core/services/survey";

type ReadSurveysDependencies = {
  comparison: (
    actorUserId: string, courseId: string, familySlug: string,
  ) => ReturnType<typeof getSurveyComparison>;
  template: (slug: string) => ReturnType<typeof getSurveyTemplate>;
  response: (actorUserId: string, stepId: string) => ReturnType<typeof getSurveyResponse>;
};

export function createReadSurveysApplication(dependencies: ReadSurveysDependencies) {
  return {
    getComparison(actorUserId: string, courseId: string, familySlug: string) {
      return dependencies.comparison(actorUserId, courseId, familySlug);
    },
    getTemplate(slug: string) {
      return dependencies.template(slug);
    },
    getResponse(actorUserId: string, stepId: string) {
      return dependencies.response(actorUserId, stepId);
    },
  };
}

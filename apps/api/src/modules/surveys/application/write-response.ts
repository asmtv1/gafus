/** HTTP uses two public args; Core receives the SQL port only in composition. */
import type {
  submitSurveyResponse,
} from "@gafus/core/services/survey";

export function createWriteSurveyResponseApplication(dependencies: {
  submit: (
    actorUserId: string, input: Parameters<typeof submitSurveyResponse>[2],
  ) => ReturnType<typeof submitSurveyResponse>;
}) {
  return {
    execute(actorUserId: string, input: Parameters<typeof submitSurveyResponse>[2]) {
      return dependencies.submit(actorUserId, input);
    },
  };
}

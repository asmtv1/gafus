/** Existing survey submission Core port; HTTP owns preflight and error mapping. */
import type { submitSurveyResponse } from "@gafus/core/services/survey";

export function createWriteSurveyResponseApplication(dependencies: {
  submit: typeof submitSurveyResponse;
}) {
  return {
    execute(
      actorUserId: Parameters<typeof submitSurveyResponse>[0],
      input: Parameters<typeof submitSurveyResponse>[1],
    ): ReturnType<typeof submitSurveyResponse> {
      return dependencies.submit(actorUserId, input);
    },
  };
}

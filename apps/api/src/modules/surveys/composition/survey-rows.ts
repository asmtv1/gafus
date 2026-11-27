import { checkCourseAccessById } from "../../courses/composition/catalog-read-instance.js";
/** API-only composition for survey SQL. Core may not import this module. */
import {
  getSurveyComparison as readCoreSurveyComparison,
  getSurveyResponse as readCoreSurveyResponse,
  submitSurveyResponse as writeCoreSurveyResponse,
  type SurveyPersistencePort,
} from "@gafus/core/services/survey";
import {
  readSurveyResponseRow, readSurveyComparisonRows, readSurveyStepRow,
  readOwnedSurveyUserStepRow, writeSurveyResponseRows,
} from "@gafus/course-progress-server/survey-rows";

export const surveyPersistence: SurveyPersistencePort = {
  readSurveyResponseRow,
  readSurveyComparisonRows,
  readSurveyStepRow,
  readOwnedSurveyUserStepRow,
  writeSurveyResponseRows,
};


// Preserve HTTP application signatures while enforcing SQL-free Core policy.
export const getSurveyComparison = (
  userId: string, courseId: string, familySlug: string,
) => readCoreSurveyComparison(surveyPersistence, userId, courseId, familySlug);

export const getSurveyResponse = (userId: string, stepId: string) =>
  readCoreSurveyResponse(surveyPersistence, userId, stepId);

export const submitSurveyResponse = (
  userId: string, input: Parameters<typeof writeCoreSurveyResponse>[3],
) => writeCoreSurveyResponse(surveyPersistence, checkCourseAccessById, userId, input);

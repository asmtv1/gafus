/** SQL-free contract for owner-scoped survey reads and atomic submission.
 * Application/Core owns validation, ACL and edit-window policy;
 * course-progress-server owns locking, write transaction and tenant predicates.
 */
import type { SurveyAnswerValue } from "@gafus/types";

export type SurveyPersistedTrainingStatus =
  | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "RESET";

export interface SurveyResponseRow {
  id: string;
  userId: string;
  courseId: string;
  stepId: string;
  petId: string | null;
  surveySlug: string;
  surveyFamilySlug: string;
  phase: "INITIAL" | "FINAL";
  surveyVersion: number;
  answers: unknown;
  submittedAt: Date;
}

export interface SurveySubmissionRowsInput {
  userId: string;
  courseId: string;
  stepId: string;
  userStepId: string;
  userTrainingId: string;
  petId?: string | null;
  surveySlug: string;
  surveyFamilySlug: string;
  phase: "INITIAL" | "FINAL";
  surveyVersion: number;
  answers: Record<string, SurveyAnswerValue>;
}

export interface SurveyPersistencePort {
  readSurveyResponseRow(userId: string, stepId: string): Promise<SurveyResponseRow | null>;
  readSurveyComparisonRows(
    userId: string, courseId: string, familySlug: string,
  ): Promise<SurveyResponseRow[]>;
  readSurveyStepRow(stepId: string): Promise<{
    id: string; type: string; surveySlug: string | null;
  } | null>;
  readOwnedSurveyUserStepRow(
    userId: string, courseId: string, userStepId: string,
  ): Promise<{
    id: string;
    userTrainingId: string;
    stepOnDay: { stepId: string; dayId: string };
    userTraining: { dayOnCourse: { dayId: string } };
  } | null>;
  /** Atomic persisted status update and anti-replay/owner fencing remain in SQL. */
  writeSurveyResponseRows(
    input: SurveySubmissionRowsInput,
    canEdit: (submittedAt: Date) => boolean,
    calculateStatus: (
      statuses: SurveyPersistedTrainingStatus[],
    ) => SurveyPersistedTrainingStatus,
  ): Promise<{ kind: "expired" | "saved"; response: SurveyResponseRow }>;
}

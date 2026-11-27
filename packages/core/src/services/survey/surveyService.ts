import type {
  SurveyPersistencePort,
  SurveyResponseRow,
} from "./surveyPersistencePort";
import { createWebLogger } from "@gafus/logger";
import type {
  SurveyAnswerValue,
  SurveyComparisonDto,
  SurveyResponseDto,
  SurveyTemplate,
} from "@gafus/types";
import { calculateDayStatusFromStatuses } from "@gafus/types";

import type { CatalogReadService } from "../course";
import { findSurveyTemplate } from "./templates";

const logger = createWebLogger("survey-service");
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export interface SubmitSurveyResponseInput {
  courseId: string;
  stepId: string;
  userStepId: string;
  surveySlug: string;
  answers: Record<string, SurveyAnswerValue>;
  petId?: string | null;
}

export interface SubmitSurveyResponseResult {
  success: boolean;
  response?: SurveyResponseDto;
  error?: string;
  code?: string;
}

function getEditableUntil(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + EDIT_WINDOW_MS);
}

function canEditResponse(submittedAt: Date, now = new Date()): boolean {
  return now.getTime() <= getEditableUntil(submittedAt).getTime();
}

function normalizeAnswers(value: unknown): Record<string, SurveyAnswerValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return {};

  const valid = Object.values(value).every(
    (answer) =>
      answer === null ||
      typeof answer === "string" ||
      typeof answer === "boolean" ||
      (Array.isArray(answer) && answer.every((entry) => typeof entry === "string")),
  );
  return valid ? (value as Record<string, SurveyAnswerValue>) : {};
}

function hasValidRequiredAnswers(
  template: SurveyTemplate,
  answers: Record<string, SurveyAnswerValue>,
): boolean {
  if (template.slug !== "separation-anxiety-screening") return true;

  return template.questions
    .filter((question) => question.required)
    .every((question) => {
      const answer = answers[question.id];
      if (Array.isArray(answer)) return answer.length > 0;
      if (typeof answer === "boolean") return true;
      if (typeof answer !== "string" || answer.trim().length === 0) return false;
      if (question.type !== "singleChoice") return true;
      return question.options?.some((option) => option.value === answer) ?? false;
    });
}

function toDto(row: SurveyResponseRow, now = new Date()): SurveyResponseDto {
  const editableUntil = getEditableUntil(row.submittedAt);
  return {
    id: row.id,
    userId: row.userId,
    courseId: row.courseId,
    stepId: row.stepId,
    petId: row.petId,
    surveySlug: row.surveySlug,
    surveyFamilySlug: row.surveyFamilySlug,
    phase: row.phase,
    surveyVersion: row.surveyVersion,
    answers: normalizeAnswers(row.answers),
    submittedAt: row.submittedAt.toISOString(),
    editableUntil: editableUntil.toISOString(),
    canEdit: now.getTime() <= editableUntil.getTime(),
  };
}

export function getSurveyTemplate(slug: string): SurveyTemplate | null {
  return findSurveyTemplate(slug);
}

export async function getSurveyResponse(
  persistence: SurveyPersistencePort,
  userId: string,
  stepId: string,
): Promise<SurveyResponseDto | null> {
  const row = await persistence.readSurveyResponseRow(userId, stepId);

  return row ? toDto(row) : null;
}

async function validateSurveyStep(
  persistence: SurveyPersistencePort,
  checkCourseAccessById: CatalogReadService["checkCourseAccessById"],
  userId: string,
  input: SubmitSurveyResponseInput,
): Promise<
  | { ok: true; template: SurveyTemplate; userTrainingId: string }
  | { ok: false; error: string; code: string }
> {
  const template = findSurveyTemplate(input.surveySlug);
  if (!template) {
    return { ok: false, error: "Анкета не найдена", code: "SURVEY_NOT_FOUND" };
  }
  if (!hasValidRequiredAnswers(template, input.answers)) {
    return {
      ok: false,
      error: "Ответьте на все обязательные вопросы анкеты",
      code: "SURVEY_REQUIRED_ANSWERS_MISSING",
    };
  }

  const access = await checkCourseAccessById(input.courseId, userId);
  if (!access.hasAccess) {
    return { ok: false, error: "Нет доступа к курсу", code: "COURSE_ACCESS_DENIED" };
  }

  const step = await persistence.readSurveyStepRow(input.stepId);
  if (!step || step.type !== "SURVEY" || step.surveySlug !== input.surveySlug) {
    return { ok: false, error: "Шаг не является анкетой", code: "INVALID_SURVEY_STEP" };
  }

  const userStep = await persistence.readOwnedSurveyUserStepRow(userId, input.courseId, input.userStepId);
  if (!userStep || userStep.stepOnDay.stepId !== input.stepId ||
      userStep.stepOnDay.dayId !== userStep.userTraining.dayOnCourse.dayId) {
    // Do not disclose whether an unrelated owned UserStep exists.
    return { ok: false, error: "Шаг пользователя не найден", code: "USER_STEP_NOT_FOUND" };
  }

  return { ok: true, template, userTrainingId: userStep.userTrainingId };
}

export async function submitSurveyResponse(
  persistence: SurveyPersistencePort,
  checkCourseAccessById: CatalogReadService["checkCourseAccessById"],
  userId: string,
  input: SubmitSurveyResponseInput,
): Promise<SubmitSurveyResponseResult> {
  try {
    const validation = await validateSurveyStep(persistence, checkCourseAccessById, userId, input);
    if (!validation.ok) {
      return { success: false, error: validation.error, code: validation.code };
    }

    const outcome = await persistence.writeSurveyResponseRows({
      userId, courseId: input.courseId, stepId: input.stepId,
      userStepId: input.userStepId, userTrainingId: validation.userTrainingId,
      petId: input.petId, answers: input.answers,
      surveySlug: validation.template.slug,
      surveyFamilySlug: validation.template.familySlug,
      phase: validation.template.phase, surveyVersion: validation.template.version,
    }, canEditResponse, statuses => {
      const next = calculateDayStatusFromStatuses(statuses);
      // The broader domain enum includes PAUSED, which is not a persisted
      // Prisma TrainingStatus. Never write an unsupported state.
      if (!["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "RESET"].includes(next))
        throw new Error("SURVEY_UNSUPPORTED_TRAINING_STATUS");
      return next as (typeof statuses)[number];
    });

    if (outcome.kind === "expired") {
      return {
        success: false,
        error: "Редактирование анкеты доступно только в течение 24 часов после заполнения",
        code: "SURVEY_EDIT_WINDOW_EXPIRED",
        response: toDto(outcome.response),
      };
    }
    return { success: true, response: toDto(outcome.response) };
  } catch (error) {
    logger.error("Failed to submit survey response", error as Error, {
      userId,
      stepId: input.stepId,
      surveySlug: input.surveySlug,
    });
    return { success: false, error: "Не удалось сохранить анкету", code: "SURVEY_SUBMIT_FAILED" };
  }
}

export async function getSurveyComparison(
  persistence: SurveyPersistencePort,
  userId: string,
  courseId: string,
  familySlug: string,
): Promise<SurveyComparisonDto | null> {
  const rows = await persistence.readSurveyComparisonRows(userId, courseId, familySlug);

  const initial = rows.find((row) => row.phase === "INITIAL");
  const final = rows.find((row) => row.phase === "FINAL");
  if (!initial || !final) return null;

  const initialAnswers = normalizeAnswers(initial.answers);
  const finalAnswers = normalizeAnswers(final.answers);
  const questionIds = Array.from(
    new Set([...Object.keys(initialAnswers), ...Object.keys(finalAnswers)]),
  );

  return {
    familySlug,
    initialSubmittedAt: initial.submittedAt.toISOString(),
    finalSubmittedAt: final.submittedAt.toISOString(),
    items: questionIds.map((questionId) => {
      const before = initialAnswers[questionId] ?? null;
      const after = finalAnswers[questionId] ?? null;
      return {
        questionId,
        before,
        after,
        changed: JSON.stringify(before) !== JSON.stringify(after),
      };
    }),
  };
}

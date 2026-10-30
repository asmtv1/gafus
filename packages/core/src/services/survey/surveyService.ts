import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type {
  SurveyAnswerValue,
  SurveyComparisonDto,
  SurveyResponseDto,
  SurveyTemplate,
} from "@gafus/types";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";

import { checkCourseAccessById } from "../course";
import { findSurveyTemplate } from "./templates";

const logger = createWebLogger("survey-service");
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const db = prisma as typeof prisma & {
  surveyResponse: {
    findUnique: (args: unknown) => Promise<SurveyResponseRow | null>;
    findMany: (args: unknown) => Promise<SurveyResponseRow[]>;
  };
};

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

type SurveyResponseRow = {
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
  createdAt?: Date;
  updatedAt?: Date;
};

type TxClient = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  surveyResponse: {
    findUnique: (args: {
      where: { userId_stepId: { userId: string; stepId: string } };
    }) => Promise<SurveyResponseRow | null>;
    create: (args: unknown) => Promise<SurveyResponseRow>;
    update: (args: unknown) => Promise<SurveyResponseRow>;
  };
  userStep: {
    update: (args: unknown) => Promise<unknown>;
    findMany: (args: {
      where: { userTrainingId: string };
      select: { status: true };
    }) => Promise<{ status: TrainingStatus }[]>;
  };
  userTraining: {
    update: (args: unknown) => Promise<unknown>;
  };
};

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
  userId: string,
  stepId: string,
): Promise<SurveyResponseDto | null> {
  const row = await db.surveyResponse.findUnique({
    where: { userId_stepId: { userId, stepId } },
  });

  return row ? toDto(row) : null;
}

async function validateSurveyStep(
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

  const step = await prisma.step.findFirst({
    where: { id: input.stepId },
    select: { id: true, type: true, surveySlug: true },
  } as never);
  if (!step || step.type !== "SURVEY" || step.surveySlug !== input.surveySlug) {
    return { ok: false, error: "Шаг не является анкетой", code: "INVALID_SURVEY_STEP" };
  }

  const userStep = await prisma.userStep.findFirst({
    where: {
      id: input.userStepId,
      userTraining: {
        userId,
        dayOnCourse: { courseId: input.courseId },
      },
    },
    // A user can have multiple physical steps in a course. Binding only
    // UserTraining.courseId lets a SURVEY mark another THEORY/EXAM step as
    // completed. Read the exact physical StepOnDay and its training day.
    select: {
      id: true,
      userTrainingId: true,
      stepOnDay: { select: { stepId: true, dayId: true } },
      userTraining: { select: { dayOnCourse: { select: { dayId: true } } } },
    },
  });
  if (!userStep || userStep.stepOnDay.stepId !== input.stepId ||
      userStep.stepOnDay.dayId !== userStep.userTraining.dayOnCourse.dayId) {
    // Do not disclose whether an unrelated owned UserStep exists.
    return { ok: false, error: "Шаг пользователя не найден", code: "USER_STEP_NOT_FOUND" };
  }

  return { ok: true, template, userTrainingId: userStep.userTrainingId };
}

async function completeSurveyStep(tx: TxClient, userStepId: string, userTrainingId: string) {
  await tx.userStep.update({
    where: { id: userStepId },
    data: { status: TrainingStatus.COMPLETED },
  });

  // Read our own uncommitted userStep completion on the SAME transaction.
  const userSteps = await tx.userStep.findMany({
    where: { userTrainingId },
    select: { status: true },
  });
  const statuses = userSteps.map((step) => step.status);
  const nextStatus =
    statuses.length > 0 ? calculateDayStatusFromStatuses(statuses) : TrainingStatus.COMPLETED;

  await tx.userTraining.update({
    where: { id: userTrainingId },
    data: { status: nextStatus },
  });
}

export async function submitSurveyResponse(
  userId: string,
  input: SubmitSurveyResponseInput,
): Promise<SubmitSurveyResponseResult> {
  try {
    const validation = await validateSurveyStep(userId, input);
    if (!validation.ok) {
      return { success: false, error: validation.error, code: validation.code };
    }

    const outcome = await (
      prisma.$transaction as unknown as <T>(callback: (tx: TxClient) => Promise<T>) => Promise<T>
    )(async (tx) => {
      // Serialize competing Survey submissions for the same user/day BEFORE any
      // response or step mutation, so each later status read sees committed siblings.
      // Locking only this parent row lets unrelated days proceed independently.
      const parent = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM public."UserTraining"
        WHERE "id" = ${validation.userTrainingId} FOR UPDATE
      `;
      if (parent.length !== 1) throw new Error("USER_TRAINING_NOT_FOUND");

      // Resolve create-vs-edit and the existing 24h rule AFTER acquiring the
      // parent lock: neither a concurrent create nor lock wait may stale them.
      const existing = await tx.surveyResponse.findUnique({
        where: { userId_stepId: { userId, stepId: input.stepId } },
      });
      if (existing && !canEditResponse(existing.submittedAt)) {
        return { kind: "expired" as const, response: existing };
      }

      const saved = existing
        ? await tx.surveyResponse.update({
            where: { id: existing.id },
            data: {
              answers: input.answers,
              petId: input.petId ?? null,
            },
          })
        : await tx.surveyResponse.create({
            data: {
              userId,
              courseId: input.courseId,
              stepId: input.stepId,
              petId: input.petId ?? null,
              surveySlug: validation.template.slug,
              surveyFamilySlug: validation.template.familySlug,
              phase: validation.template.phase,
              surveyVersion: validation.template.version,
              answers: input.answers,
              submittedAt: new Date(),
            },
          });

      await completeSurveyStep(tx, input.userStepId, validation.userTrainingId);
      return { kind: "saved" as const, response: saved };
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
  userId: string,
  courseId: string,
  familySlug: string,
): Promise<SurveyComparisonDto | null> {
  const rows = await db.surveyResponse.findMany({
    where: { userId, courseId, surveyFamilySlug: familySlug },
    orderBy: { submittedAt: "asc" },
  });

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

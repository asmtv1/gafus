/**
 * Zod-схемы для сервиса шагов тренера (core).
 * Валидация входных данных для create/update шага и шаблонов.
 */

import { z } from "zod";

import { isKnownSurveySlug } from "../survey/templates";

const STEP_TYPES = [
  "TRAINING",
  "EXAMINATION",
  "THEORY",
  "BREAK",
  "PRACTICE",
  "DIARY",
  "SURVEY",
] as const;

export const stepTypeSchema = z.enum(STEP_TYPES);

const checklistQuestionSchema = z
  .object({
    id: z.string(),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctAnswer: z.number().int().min(0),
    comment: z.string().max(500).optional(),
  })
  .refine((question) => question.correctAnswer < question.options.length, {
    message: "Индекс правильного ответа должен соответствовать одному из вариантов",
    path: ["correctAnswer"],
  });

export const checklistSchema = z.array(checklistQuestionSchema);

const createStepBaseSchema = z.object({
  id: z.string().uuid("Некорректный ID шага (ожидается UUID)"),
  title: z.string().min(3, "Минимум 3 символа").max(100),
  description: z.string().min(10, "Минимум 10 символов").max(8000),
  type: stepTypeSchema,
  durationSec: z.number().int().min(1).max(6000).nullable(),
  estimatedDurationSec: z.number().int().min(1).nullable(),
  videoUrl: z.string().max(2000).optional().nullable(),
  imageUrls: z.array(z.string()),
  pdfUrls: z.array(z.string()),
  checklist: checklistSchema.optional().nullable(),
  requiresVideoReport: z.boolean(),
  requiresWrittenFeedback: z.boolean(),
  hasTestQuestions: z.boolean(),
  surveySlug: z.string().trim().optional().nullable(),
  isDailyCourse: z.boolean().default(false),
});

type StepRuleFields = Pick<
  z.infer<typeof createStepBaseSchema>,
  "type" | "hasTestQuestions" | "requiresVideoReport" | "requiresWrittenFeedback" | "durationSec" | "surveySlug"
>;

/** Единое правило наличия способа сдачи экзамена. */
export function getExaminationMechanismError(data: Pick<StepRuleFields,
  "hasTestQuestions" | "requiresVideoReport" | "requiresWrittenFeedback"
>): string | null {
  return data.hasTestQuestions || data.requiresVideoReport || data.requiresWrittenFeedback
    ? null
    : "Для экзаменационного шага выберите хотя бы один тип экзамена";
}

/** Одинаковые обязательные бизнес-правила при создании и редактировании шага. */
function checkStepBusinessRules(data: StepRuleFields, ctx: z.RefinementCtx) {
  if (data.type === "EXAMINATION") {
    const error = getExaminationMechanismError(data);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }
  if (
    (data.type === "TRAINING" || data.type === "BREAK") &&
    (data.durationSec == null || data.durationSec <= 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Длительность обязательна для данного типа",
    });
  }
  if (data.type === "SURVEY" && (!data.surveySlug || !isKnownSurveySlug(data.surveySlug))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Для анкетного шага выберите доступный шаблон анкеты",
    });
  }
}

export const createStepSchema = createStepBaseSchema.superRefine(checkStepBusinessRules);

export const updateStepSchema = createStepBaseSchema.omit({ id: true }).extend({
  id: z.string().min(1, "ID шага обязателен"),
}).superRefine(checkStepBusinessRules);

export const deleteStepsSchema = z.object({
  stepIds: z.array(z.string().min(1)).min(1, "Укажите шаги для удаления"),
});

export const createStepFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  authorId: z.string().min(1),
});

export type CreateStepInput = z.infer<typeof createStepSchema>;
export type UpdateStepInput = z.infer<typeof updateStepSchema>;
export type DeleteStepsInput = z.infer<typeof deleteStepsSchema>;
export type CreateStepFromTemplateInput = z.infer<typeof createStepFromTemplateSchema>;

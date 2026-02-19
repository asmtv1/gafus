/**
 * Zod-схемы для сервиса шагов тренера (core).
 * Валидация входных данных для create/update шага и шаблонов.
 */

import { z } from "zod";

const STEP_TYPES = [
  "TRAINING",
  "EXAMINATION",
  "THEORY",
  "BREAK",
  "PRACTICE",
  "DIARY",
] as const;

export const stepTypeSchema = z.enum(STEP_TYPES);

const checklistQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  comment: z.string().max(500).optional(),
});

export const checklistSchema = z.array(checklistQuestionSchema);

const createStepBaseSchema = z.object({
  id: z.string().uuid("Некорректный ID шага (ожидается UUID)"),
  title: z.string().min(3, "Минимум 3 символа").max(100),
  description: z.string().min(10, "Минимум 10 символов").max(3000),
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
});

export const createStepSchema = createStepBaseSchema
  .refine(
    (data) => {
      if (data.type !== "EXAMINATION") return true;
      return (
        data.hasTestQuestions ||
        data.requiresVideoReport ||
        data.requiresWrittenFeedback
      );
    },
    { message: "Для экзаменационного шага выберите хотя бы один тип экзамена" },
  )
  .refine(
    (data) => {
      if (data.type !== "TRAINING" && data.type !== "BREAK") return true;
      return data.durationSec != null && data.durationSec > 0;
    },
    { message: "Длительность обязательна для данного типа" },
  );

export const updateStepSchema = createStepBaseSchema.omit({ id: true }).extend({
  id: z.string().min(1, "ID шага обязателен"),
});

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
export type CreateStepFromTemplateInput = z.infer<
  typeof createStepFromTemplateSchema
>;

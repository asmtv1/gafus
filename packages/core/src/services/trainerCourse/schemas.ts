/**
 * Zod-схемы для сервиса курсов тренера (core).
 * Валидация входных данных для create/update курса.
 */

import { z } from "zod";

const trainingLevelSchema = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "EXPERT",
]);

const guideRefine = <T extends { isGuide?: boolean; guideContent?: string | null; trainingDays?: string[] }>(
  data: T,
  ctx: z.RefinementCtx
) => {
  const isGuide = data.isGuide === true;
  if (isGuide && (!data.guideContent || data.guideContent.trim() === "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guideContent"], message: "Для гайда обязателен HTML-контент" });
  }
  if (isGuide && data.trainingDays && data.trainingDays.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trainingDays"], message: "Гайд не может содержать тренировочные дни" });
  }
};

export const createTrainerCourseSchema = z
  .object({
    id: z.string().uuid("Некорректный ID курса (ожидается UUID)"),
    name: z.string().min(1, "Название обязательно").max(500),
    shortDesc: z.string().max(2000).default(""),
    description: z.string().default(""),
    duration: z.string().min(1, "Укажите длительность").max(100),
    videoUrl: z.string().max(2000).optional().nullable(),
    logoImg: z.string(), // готовый CDN URL или пустая строка
    isPublic: z.boolean(),
    isPaid: z.boolean().default(false),
    priceRub: z.number().min(0).max(999_999).nullable(),
    showInProfile: z.boolean().default(true),
    isPersonalized: z.boolean().default(false),
    isGuide: z.boolean().default(false),
    guideContent: z.string().max(2_000_000).optional().nullable(),
    trainingDays: z.array(z.string().min(1)).default([]),
    allowedUsers: z.array(z.string().min(1)).default([]),
    equipment: z.string().max(1000).default(""),
    trainingLevel: trainingLevelSchema.default("BEGINNER"),
  })
  .superRefine(guideRefine);

export const updateTrainerCourseSchema = z
  .object({
    id: z.string().min(1, "ID курса обязателен"),
    name: z.string().min(1, "Название обязательно").max(500),
    shortDesc: z.string().max(2000).default(""),
    description: z.string().default(""),
    duration: z.string().min(1, "Укажите длительность").max(100),
    videoUrl: z.string().max(2000).optional().nullable(),
    logoImg: z.string(),
    isPublic: z.boolean(),
    isPaid: z.boolean().default(false),
    priceRub: z.number().min(0).max(999_999).nullable(),
    showInProfile: z.boolean().default(true),
    isPersonalized: z.boolean().default(false),
    isGuide: z.boolean().default(false),
    guideContent: z.string().max(2_000_000).optional().nullable(),
    trainingDays: z.array(z.string().min(1)).default([]),
    allowedUsers: z.array(z.string().min(1)).default([]),
    equipment: z.string().max(1000).default(""),
    trainingLevel: trainingLevelSchema.default("BEGINNER"),
  })
  .superRefine(guideRefine);

export type CreateTrainerCourseInput = z.infer<typeof createTrainerCourseSchema>;
export type UpdateTrainerCourseInput = z.infer<typeof updateTrainerCourseSchema>;

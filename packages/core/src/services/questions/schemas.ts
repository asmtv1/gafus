import { z } from "zod";
import { QUESTION_CATEGORIES, QUESTION_LIMITS, QUESTION_REPORT_REASONS } from "@gafus/types";
const body = z
  .string()
  .trim()
  .min(1, "Напишите текст")
  .max(QUESTION_LIMITS.body, "Текст не должен превышать 10 000 символов");
const photoIds = z
  .array(z.string().min(1).max(128))
  .max(QUESTION_LIMITS.photos, "Можно прикрепить до 5 фото")
  .default([])
  .refine((ids) => new Set(ids).size === ids.length, "Фото не должны повторяться");
export const questionEditSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Напишите заголовок")
    .max(QUESTION_LIMITS.title, "Заголовок не должен превышать 150 символов"),
  body,
  category: z.enum(QUESTION_CATEGORIES),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(32)
        .transform((s) => s.replace(/^#+/, "").trim())
        .refine(Boolean, "Пустой тег"),
    )
    .max(QUESTION_LIMITS.tags, "Можно добавить до 5 тегов")
    .default([])
    .transform((tags) => [...new Set(tags)]),
  photoIds,
});
export const questionCreateSchema = questionEditSchema.extend({
  clientRequestId: z.string().uuid(),
});
export const answerEditSchema = z.object({ body, photoIds });
export const answerCreateSchema = answerEditSchema.extend({
  replyToId: z.string().min(1).max(128).nullable().optional(),
  clientRequestId: z.string().uuid(),
});
export const questionListSchema = z.object({
  search: z.string().trim().max(150).default(""),
  category: z.enum(QUESTION_CATEGORIES).optional(),
  status: z.enum(["waiting", "answered", "resolved"]).optional(),
  mine: z
    .enum(["true", "false"])
    .default("false")
    .transform((s) => s === "true"),
  sort: z.enum(["new", "active", "unanswered"]).default("new"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const answerListSchema = z.object({
  sort: z.enum(["useful", "new"]).default("useful"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const questionReportSchema = z.object({
  answerId: z.string().min(1).max(128).optional(),
  reason: z.enum(QUESTION_REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
});

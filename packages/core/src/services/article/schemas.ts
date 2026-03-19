/**
 * Zod-схемы для articleService (core).
 */
import { z } from "zod";

/** slug: 2+ символа, латиница, цифры, дефисы. Допускаем и 1 символ для коротких slug. */
const slugRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const baseArticleSchema = z.object({
  title: z.string().min(1, "Заголовок обязателен").max(500),
  contentType: z.enum(["TEXT", "HTML"]).default("HTML"),
  content: z.string().min(1, "Контент обязателен").max(2_000_000),
  visibility: z.enum(["PUBLIC", "PAID"]).default("PUBLIC"),
  priceRub: z.number().min(0).max(999_999).nullable().optional(),
  videoUrl: z.string().max(2000).nullable().optional(),
  logoImg: z.string().max(2000).default(""),
  imageUrls: z.array(z.string().url()).max(20).default([]),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(slugRegex, "Slug может содержать буквы, цифры и дефисы"),
  description: z.string().max(5000).default(""),
});

export const createArticleSchema = baseArticleSchema
  .extend({ id: z.string().min(1).optional() })
  .refine(
    (data) =>
      data.visibility !== "PAID" || (data.priceRub != null && data.priceRub > 0),
    { message: "Для платной статьи укажите цену > 0", path: ["priceRub"] }
  )
  .refine(
    (data) =>
      data.visibility !== "PAID" || (data.description?.trim() ?? "").length > 0,
    { message: "Для платной статьи укажите описание", path: ["description"] }
  );

export const updateArticleSchema = baseArticleSchema
  .partial()
  .extend({ id: z.string().min(1, "ID статьи обязателен") })
  .refine(
    (data) =>
      data.visibility !== "PAID" || (data.priceRub != null && data.priceRub > 0),
    { message: "Для платной статьи укажите цену > 0", path: ["priceRub"] }
  )
  .refine(
    (data) =>
      data.visibility !== "PAID" ||
      (data.description?.trim() ?? "").length > 0,
    { message: "Для платной статьи укажите описание", path: ["description"] }
  );

export type CreateArticleSchemaInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleSchemaInput = z.infer<typeof updateArticleSchema>;

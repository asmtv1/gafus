/**
 * Zod-схемы для сервиса курсов тренера (core).
 * Валидация входных данных для create/update курса.
 */

import { z } from "zod";

/** Защита от подмены src (javascript:, data: HTML и т.д.) при сохранении из клиента */
const MAX_LOGO_IMG_URL_LENGTH = 2000;

function isSafeCourseLogoUrl(val: string): boolean {
  const t = val.trim();
  if (t === "") return true;
  try {
    return new URL(t).protocol === "https:";
  } catch {
    return false;
  }
}

const trainingLevelSchema = z.enum([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "EXPERT",
]);

export const createTrainerCourseSchema = z.object({
  id: z.string().uuid("Некорректный ID курса (ожидается UUID)"),
  name: z.string().min(1, "Название обязательно").max(500),
  shortDesc: z.string().max(2000).default(""),
  description: z.string().default(""),
  duration: z.string().min(1, "Укажите длительность").max(100),
  videoUrl: z.string().max(2000).optional().nullable(),
  logoImg: z
    .string()
    .max(MAX_LOGO_IMG_URL_LENGTH)
    .refine(isSafeCourseLogoUrl, { message: "Некорректный URL логотипа (разрешён только https)" }),
  isPublic: z.boolean(),
  isPaid: z.boolean().default(false),
  priceRub: z.number().min(0).max(999_999).nullable(),
  showInProfile: z.boolean().default(true),
  isPersonalized: z.boolean().default(false),
  trainingDays: z.array(z.string().min(1)).default([]),
  allowedUsers: z.array(z.string().min(1)).default([]),
  equipment: z.string().max(1000).default(""),
  trainingLevel: trainingLevelSchema.default("BEGINNER"),
});

export const updateTrainerCourseSchema = z.object({
  id: z.string().min(1, "ID курса обязателен"),
  name: z.string().min(1, "Название обязательно").max(500),
  shortDesc: z.string().max(2000).default(""),
  description: z.string().default(""),
  duration: z.string().min(1, "Укажите длительность").max(100),
  videoUrl: z.string().max(2000).optional().nullable(),
  logoImg: z
    .string()
    .max(MAX_LOGO_IMG_URL_LENGTH)
    .refine(isSafeCourseLogoUrl, { message: "Некорректный URL логотипа (разрешён только https)" }),
  isPublic: z.boolean(),
  isPaid: z.boolean().default(false),
  priceRub: z.number().min(0).max(999_999).nullable(),
  showInProfile: z.boolean().default(true),
  isPersonalized: z.boolean().default(false),
  trainingDays: z.array(z.string().min(1)).default([]),
  allowedUsers: z.array(z.string().min(1)).default([]),
  equipment: z.string().max(1000).default(""),
  trainingLevel: trainingLevelSchema.default("BEGINNER"),
});

export type CreateTrainerCourseInput = z.infer<typeof createTrainerCourseSchema>;
export type UpdateTrainerCourseInput = z.infer<typeof updateTrainerCourseSchema>;

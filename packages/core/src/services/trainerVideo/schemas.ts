/**
 * Zod-схемы для сервиса видео тренеров (core).
 * Валидация регистрации, обновления и запросов.
 */

import { z } from "zod";

/** Регистрация видео после загрузки на CDN */
export const registerTrainerVideoSchema = z.object({
  id: z.string().optional(),
  trainerId: z.string().min(1, "ID тренера обязателен"),
  relativePath: z.string().min(1, "Путь к файлу обязателен"),
  originalName: z.string().min(1, "Имя файла обязательно"),
  mimeType: z.string().min(1, "MIME-тип обязателен"),
  fileSize: z.number().int().nonnegative("Размер файла не может быть отрицательным"),
  durationSec: z.number().int().nonnegative().nullable().optional(),
});

/** Обновление названия видео */
export const updateTrainerVideoNameSchema = z.object({
  videoId: z.string().min(1, "ID видео обязателен"),
  displayName: z
    .string()
    .max(255, "Название не должно превышать 255 символов")
    .optional()
    .nullable(),
});

/** Удаление видео (только валидация id) */
export const deleteTrainerVideoSchema = z.object({
  videoId: z.string().min(1, "ID видео обязателен"),
});

/** Параметры списка видео тренера */
export const getTrainerVideosOptionsSchema = z.object({
  trainerId: z.string().min(1),
  forAdmin: z.boolean().optional().default(false),
});

export type RegisterTrainerVideoInput = z.infer<typeof registerTrainerVideoSchema>;
export type UpdateTrainerVideoNameInput = z.infer<typeof updateTrainerVideoNameSchema>;
export type DeleteTrainerVideoInput = z.infer<typeof deleteTrainerVideoSchema>;
export type GetTrainerVideosOptions = z.infer<typeof getTrainerVideosOptionsSchema>;

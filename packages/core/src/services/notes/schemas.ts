/**
 * Zod-схемы для сервиса заметок тренера (core).
 * Валидация входных данных для create/update/delete и запроса списка.
 */

import { z } from "zod";

/** Схема одной текстовой записи заметки */
export const noteEntrySchema = z.object({
  content: z
    .string()
    .min(1, "Текст записи обязателен")
    .max(10000, "Максимум 10000 символов")
    .refine((val) => val.trim().length > 0, {
      message: "Текст записи не может состоять только из пробелов",
    })
    .transform((val) => val.trim()),
  order: z.number().int().min(0).default(0),
  isVisibleToStudent: z.boolean().default(false),
});

export const createTrainerNoteSchema = z.object({
  title: z
    .string()
    .max(200, "Максимум 200 символов")
    .transform((val) => val.trim() || undefined)
    .optional()
    .nullable(),
  entries: z
    .array(noteEntrySchema)
    .min(1, "Добавьте хотя бы одну текстовую запись"),
  studentIds: z
    .array(z.string().cuid("Некорректный ID ученика"))
    .min(1, "Выберите хотя бы одного ученика"),
  tags: z
    .array(z.string())
    .default([])
    .transform((val) =>
      val.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 50),
    ),
});

export const updateTrainerNoteSchema = z.object({
  id: z.string().cuid("Некорректный ID заметки"),
  title: z
    .string()
    .max(200, "Максимум 200 символов")
    .transform((val) => val.trim() || undefined)
    .optional()
    .nullable(),
  entries: z
    .array(noteEntrySchema)
    .min(1, "Добавьте хотя бы одну текстовую запись")
    .optional(),
  studentIds: z
    .array(z.string().cuid("Некорректный ID ученика"))
    .min(1, "Выберите хотя бы одного ученика")
    .optional(),
  tags: z
    .array(z.string())
    .transform((val) =>
      val.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 50),
    )
    .optional(),
});

export const deleteTrainerNoteSchema = z.object({
  id: z.string().cuid("Некорректный ID заметки"),
});

/** Параметры запроса списка заметок (пагинация, фильтры) */
export const notesQuerySchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(50),
  tags: z.array(z.string()).optional(),
  studentId: z.string().cuid().optional(),
  trainerId: z.string().cuid().optional().nullable(),
});

export type CreateTrainerNoteInput = z.infer<typeof createTrainerNoteSchema>;
export type UpdateTrainerNoteInput = z.infer<typeof updateTrainerNoteSchema>;
export type DeleteTrainerNoteInput = z.infer<typeof deleteTrainerNoteSchema>;
export type NotesQueryInput = z.infer<typeof notesQuerySchema>;

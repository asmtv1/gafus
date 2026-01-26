import { z } from "zod";

// Схема для одной текстовой записи
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

export const createNoteSchema = z.object({
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
    .transform((val) => val.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 50)), // Обрезаем пробелы и фильтруем пустые/длинные теги
});

export const updateNoteSchema = z.object({
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
    .transform((val) => val.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 50)) // Обрезаем пробелы и фильтруем пустые/длинные теги
    .optional(),
});

export const deleteNoteSchema = z.object({
  id: z.string().cuid("Некорректный ID заметки"),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>;

import { z } from "zod";
import { PetType } from "@gafus/prisma";

import { numericField, urlSchema } from "./schemas";

// ===== КОНСТАНТЫ =====

const MIN_BIRTH_DATE = new Date("1990-01-01");

/**
 * Дата рождения: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД (как из type="date").
 */
export function parsePetBirthDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = trimmed.match(iso);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  const ru = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  const ruMatch = trimmed.match(ru);
  if (ruMatch) {
    const day = parseInt(ruMatch[1], 10);
    const month = parseInt(ruMatch[2], 10) - 1;
    const year = parseInt(ruMatch[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  return null;
}

/**
 * Календарная дата YYYY-MM-DD (строка) → ДД.ММ.ГГГГ для текстового поля.
 * Иначе возвращает строку как есть (уже введённый формат).
 */
export function formatIsoBirthDateToDdMmYyyy(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return s;
}

// ===== СХЕМЫ ПОЛЕЙ ПИТОМЦА =====

/**
 * Схема для имени питомца
 */
const petNameSchema = z
  .string()
  .trim()
  .min(2, "Имя должно содержать минимум 2 символа")
  .max(50, "Имя не может быть длиннее 50 символов")
  .regex(/^[а-яёА-ЯЁa-zA-Z\s-]+$/, "Имя может содержать только буквы, пробелы и дефис");

/**
 * Схема для типа питомца
 */
const petTypeSchema = z.nativeEnum(PetType, {
  errorMap: () => ({ message: "Неверный тип питомца" }),
});

/**
 * Схема для породы питомца
 */
const petBreedSchema = z
  .string()
  .trim()
  .min(2, "Порода должна содержать минимум 2 символа")
  .max(50, "Порода не может быть длиннее 50 символов");

/**
 * Схема для даты рождения: ввод ДД.ММ.ГГГГ (или ISO); в данных — ГГГГ-ММ-ДД.
 */
export const petBirthDateSchema = z
  .string()
  .trim()
  .min(1, "Дата рождения обязательна")
  .refine((value) => parsePetBirthDateInput(value) !== null, {
    message: "Укажите дату как ДД.ММ.ГГГГ (например, 15.03.2020)",
  })
  .refine((value) => {
    const date = parsePetBirthDateInput(value)!;
    return date <= new Date();
  }, "Дата не может быть в будущем")
  .refine((value) => {
    const date = parsePetBirthDateInput(value)!;
    return date >= MIN_BIRTH_DATE;
  }, "Дата слишком старая")
  .transform((value) => {
    const date = parsePetBirthDateInput(value)!;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

/**
 * Схема для роста питомца
 */
const petHeightSchema = numericField({ min: 1, max: 200, field: "Рост" });

/**
 * Схема для веса питомца
 */
const petWeightSchema = numericField({ min: 0.1, max: 200, field: "Вес" });

/**
 * Схема для заметок о питомце
 */
const petNotesSchema = z
  .string()
  .trim()
  .max(500, "Заметки не могут быть длиннее 500 символов")
  .optional();

// ===== ОСНОВНЫЕ СХЕМЫ =====

/**
 * Базовая схема для питомца
 */
const basePetSchema = z.object({
  name: petNameSchema,
  type: petTypeSchema,
  breed: petBreedSchema,
  birthDate: petBirthDateSchema,
  heightCm: petHeightSchema,
  weightKg: petWeightSchema,
  photoUrl: urlSchema,
  notes: petNotesSchema,
});

/**
 * Схема для создания питомца
 */
export const createPetSchema = basePetSchema;

/**
 * Схема для формы питомца (может включать ID)
 */
export const petFormSchema = basePetSchema.extend({
  id: z.string().trim().optional(),
});

/**
 * Схема для обновления питомца (все поля опциональны + обязательный ID)
 */
export const updatePetSchema = basePetSchema.partial().extend({
  id: z.string().trim().min(1, "ID питомца обязателен"),
});

/**
 * Схема для ID питомца
 */
export const petIdSchema = z.string().trim().min(1, "ID питомца обязателен");

// ===== ТИПЫ =====

export type CreatePetSchema = z.infer<typeof createPetSchema>;
export type PetFormSchema = z.infer<typeof petFormSchema>;
export type UpdatePetSchema = z.infer<typeof updatePetSchema>;

import { z } from "zod";
import { PetType } from "@gafus/prisma";

import { numericField, urlSchema } from "./schemas";

// ===== КОНСТАНТЫ =====

const MIN_BIRTH_DATE = new Date("1990-01-01");

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
 * Схема для даты рождения питомца
 */
const petBirthDateSchema = z
  .string()
  .trim()
  .min(1, "Дата рождения обязательна")
  .refine((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }, "Неверный формат даты")
  .refine((value) => {
    const date = new Date(value);
    return date <= new Date();
  }, "Дата не может быть в будущем")
  .refine((value) => {
    const date = new Date(value);
    return date >= MIN_BIRTH_DATE;
  }, "Дата слишком старая");

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

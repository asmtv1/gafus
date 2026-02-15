import { z } from "zod";

// ===== БАЗОВЫЕ УТИЛИТЫ =====

/**
 * Создает схему для обязательной строки с обрезкой пробелов
 */
export const trimmedNonEmptyString = (fieldName: string) =>
  z.string().trim().min(1, `${fieldName} обязателен`);

/**
 * Создает схему для числового поля с возможностью парсинга из строки
 */
export const numericField = (options: { min: number; max: number; field: string }) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (typeof value === "number") {
        return Number.isNaN(value) ? NaN : value;
      }
      const trimmed = value.trim();
      if (trimmed === "") {
        return undefined;
      }
      const num = Number(trimmed.replace(",", "."));
      return Number.isNaN(num) ? NaN : num;
    })
    .refine(
      (value) =>
        value === undefined ||
        (!Number.isNaN(value) && value >= options.min && value <= options.max),
      `${options.field} должно быть числом в диапазоне ${options.min}–${options.max}`,
    )
    .optional();

// ===== ОБЩИЕ СХЕМЫ =====

// Схемы для пользователей
export const userIdSchema = trimmedNonEmptyString("userId");
export const optionalUserIdSchema = userIdSchema.optional();

// Схемы для курсов
export const courseIdSchema = trimmedNonEmptyString("courseId");
export const optionalCourseIdSchema = courseIdSchema.optional();

// Схемы для дней тренировок
// CUID v1 для DayOnCourse.id (день курса с порядком)
export const dayOnCourseIdSchema = z.string().cuid("dayOnCourseId должен быть CUID");

// CUID v1 для Course.id (когда в API передаётся именно ID сущности, не courseType)
export const courseIdEntitySchema = z.string().cuid("courseId должен быть CUID");

// CUID v1 для UserStep.id (экзамен)
export const userStepIdSchema = z.string().cuid("userStepId должен быть CUID");

// CUID v1 для Step.id (когда в API передаётся именно ID шага)
export const stepIdEntitySchema = z.string().cuid("stepId должен быть CUID");

export const dayNumberSchema = z.number().int().min(1, "Номер дня должен быть положительным");

// Схемы для тренировок
export const trainingTypeSchema = trimmedNonEmptyString("type");
export const optionalTrainingTypeSchema = trainingTypeSchema.optional();

// Схемы для шагов тренировок
export const stepIndexSchema = z.number().int().min(0, "Индекс шага должен быть неотрицательным");

// Схемы для числовых значений
export const nonNegativeNumberSchema = z.number().min(0, "Значение должно быть неотрицательным");

export const positiveDurationSchema = z
  .number()
  .min(0, "Продолжительность должна быть неотрицательной");

// Схемы для дат
export const dateSchema = z
  .string()
  .trim()
  .min(1, "Дата обязательна")
  .refine((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }, "Неверный формат даты");

// Схемы для URL
export const urlSchema = z
  .string()
  .trim()
  .url("Неверный формат URL")
  .optional()
  .or(z.literal("").optional());

import type { ZodError, ZodSchema } from "zod";
import type { PetFormData, RegisterFormData, ValidationResult } from "@gafus/types";

import { registerFormSchema } from "./authSchemas";
import { petFormSchema } from "./petSchemas";

// ===== УТИЛИТЫ ВАЛИДАЦИИ =====

/**
 * Извлекает ошибки из ZodError в формат для форм
 */
function extractErrors(error: ZodError): Record<string, string> {
  const fieldErrors = error.flatten().fieldErrors;
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([, messages]) => messages && messages.length > 0)
      .map(([field, messages]) => [field, messages![0]]),
  );
}

/**
 * Универсальная функция валидации с использованием Zod схем
 */
function validateWithSchema<T>(schema: ZodSchema<T>, data: unknown): ValidationResult {
  const result = schema.safeParse(data);
  if (result.success) {
    return { isValid: true, errors: {} };
  }

  return {
    isValid: false,
    errors: extractErrors(result.error),
  };
}

// ===== ФУНКЦИИ ВАЛИДАЦИИ =====

/**
 * Валидация формы питомца
 */
export function validatePetForm(data: PetFormData): ValidationResult {
  return validateWithSchema(petFormSchema, data);
}

/**
 * Валидация формы регистрации
 */
export function validateRegisterForm(data: RegisterFormData): ValidationResult {
  return validateWithSchema(registerFormSchema, data);
}

/**
 * Универсальная функция валидации для любых данных
 */
export function validateData<T>(schema: ZodSchema<T>, data: unknown): ValidationResult {
  return validateWithSchema(schema, data);
}

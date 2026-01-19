import { z } from "zod";

/**
 * Безопасно парсит дату с обработкой edge cases (null, Invalid Date)
 * @param value - Значение для парсинга (строка, Date, null, undefined)
 * @returns Объект Date или null
 * @throws ValidationError если дата невалидна
 */
export function parseDateSafe(value: unknown): Date | null {
  if (value === null || value === undefined || value === "null") {
    return null;
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new Error("Invalid date format");
    }
    return value;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date format");
    }
    return date;
  }

  throw new Error("Expected string, Date, null, or undefined");
}

// Zod схема с использованием parseDateSafe
export const dateSchema = z.preprocess(
  (val) => parseDateSafe(val),
  z.date().nullable()
);
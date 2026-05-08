import {
  formatIsoBirthDateToDdMmYyyy as formatIsoBirthDateToDdMmYyyyCore,
  parsePetBirthDateInput as parsePetBirthDateInputCore,
  validatePetBirthDateInput as validatePetBirthDateInputCore,
} from "@gafus/core/validation/pet";

function toApiIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Парсинг даты рождения из строки поля ввода.
 */
export function parsePetBirthDateInput(value: string): Date | null {
  return parsePetBirthDateInputCore(value);
}

/**
 * ISO YYYY-MM-DD (или префикс) → ДД.ММ.ГГГГ для отображения в поле.
 */
export function formatIsoBirthDateToDdMmYyyy(value: string | null | undefined): string {
  return formatIsoBirthDateToDdMmYyyyCore(value);
}

/** Опциональная дата профиля: пусто OK, иначе ДД.ММ.ГГГГ / ISO → ГГГГ-ММ-ДД. */
export function validateOptionalProfileBirthDateInput(
  raw: string,
): { ok: true; apiValue: string } | { ok: false; message: string } {
  const t = raw.trim();
  if (!t) return { ok: true, apiValue: "" };
  const d = parsePetBirthDateInput(t);
  if (!d) return { ok: false, message: "Укажите дату в формате ДД.ММ.ГГГГ" };
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (d > endOfToday) return { ok: false, message: "Дата не может быть в будущем" };
  return { ok: true, apiValue: toApiIsoDate(d) };
}

/** Обязательная дата питомца (лимиты как petBirthDateSchema на веб). */
export function validatePetBirthDateInput(
  raw: string,
): { ok: true; apiValue: string } | { ok: false; message: string } {
  return validatePetBirthDateInputCore(raw);
}

/**
 * Паритет с apps/web/src/shared/lib/validation/petSchemas.ts:
 * ввод ДД.ММ.ГГГГ или ГГГГ-ММ-ДД, в API — ГГГГ-ММ-ДД.
 */

const MIN_PET_BIRTH_DATE = new Date("1990-01-01");

/**
 * Парсинг даты рождения из строки поля ввода.
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
 * ISO YYYY-MM-DD (или префикс) → ДД.ММ.ГГГГ для отображения в поле.
 */
export function formatIsoBirthDateToDdMmYyyy(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return s;
}

function toApiIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const t = raw.trim();
  if (!t) return { ok: false, message: "Дата рождения обязательна" };
  const d = parsePetBirthDateInput(t);
  if (!d) {
    return { ok: false, message: "Укажите дату как ДД.ММ.ГГГГ (например, 15.03.2020)" };
  }
  if (d > new Date()) return { ok: false, message: "Дата не может быть в будущем" };
  if (d < MIN_PET_BIRTH_DATE) return { ok: false, message: "Дата слишком старая" };
  return { ok: true, apiValue: toApiIsoDate(d) };
}

import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";

/** Без `+` подставляем РФ/локальный ввод; с `+` — международный формат. */
const DEFAULT_REGION: CountryCode = "RU";

function tryParseInput(raw: string) {
  const s = raw.trim();
  if (!s) {
    return null;
  }
  try {
    return s.startsWith("+") ? parsePhoneNumber(s) : parsePhoneNumber(s, DEFAULT_REGION);
  } catch {
    return null;
  }
}

/**
 * Нормализация телефона для заявки на консультацию (E.164).
 * «Возможный» по libphonenumber — без жёсткой привязки к РФ; короткий RU-ввод без + по-прежнему с регионом RU.
 */
export function normalizeRuPhoneForStorage(raw: string): string | null {
  const phone = tryParseInput(raw);
  if (phone == null || !phone.isPossible()) {
    return null;
  }
  return phone.format("E.164");
}

/** Кнопка «Забронировать» и подсказки в форме (без throw). */
export function isLikelyValidRuPhoneInput(raw: string): boolean {
  return normalizeRuPhoneForStorage(raw) != null;
}

export function formatRuPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) {
    return "—";
  }
  try {
    const p = parsePhoneNumber(e164);
    if (p != null && p.isPossible()) {
      return p.formatInternational();
    }
  } catch {
    // ignore
  }
  return e164;
}

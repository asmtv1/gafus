import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";

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

export function normalizeRuPhoneForStorage(raw: string): string | null {
  const phone = tryParseInput(raw);
  if (phone == null || !phone.isPossible()) {
    return null;
  }
  return phone.format("E.164");
}

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

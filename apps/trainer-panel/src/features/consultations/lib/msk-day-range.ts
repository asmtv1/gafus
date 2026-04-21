/**
 * Работа с календарными датами YYYY-MM-DD в зоне Europe/Moscow без дрейфа TZ.
 */

export const CONSULTATION_TIMEZONE = "Europe/Moscow";

/** Текущий календарный день в МСК как YYYY-MM-DD */
export function moscowTodayKey(): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: CONSULTATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Сдвиг календарной даты (гражданский календарь, не «локальный» день машины). */
export function addDaysToIsoDayKey(dayKey: string, deltaDays: number): string {
  const [ys, ms, ds] = dayKey.split("-").map(Number);
  if (!ys || !ms || !ds) {
    return dayKey;
  }
  const t = new Date(Date.UTC(ys, ms - 1, ds));
  t.setUTCDate(t.getUTCDate() + deltaDays);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Все дни от min до max включительно (ISO-строки сравнимы лексикографически). */
export function enumerateIsoDayKeysInclusive(minDayKey: string, maxDayKey: string): string[] {
  if (minDayKey > maxDayKey) {
    return [];
  }
  const out: string[] = [];
  let cursor = minDayKey;
  while (cursor <= maxDayKey) {
    out.push(cursor);
    cursor = addDaysToIsoDayKey(cursor, 1);
    if (out.length > 400) {
      break;
    }
  }
  return out;
}

/** UTC-мгновенные границы для запроса слотов по календарным дням МСК */
export function moscowDayRangeToUtcBounds(minDayKey: string, maxDayKey: string): {
  fromUtc: Date;
  toUtc: Date;
} {
  const fromUtc = new Date(`${minDayKey}T00:00:00+03:00`);
  const toUtc = new Date(`${maxDayKey}T23:59:59.999+03:00`);
  return { fromUtc, toUtc };
}

/** Календарный день МСК для мгновенной метки времени (ISO UTC). */
export function utcInstantToMoscowDayKey(isoUtc: string): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: CONSULTATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoUtc));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

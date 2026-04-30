/**
 * Форматирование дат/времени консультаций в часовом поясе МСК.
 */
export const CONSULTATION_TIMEZONE = "Europe/Moscow" as const;
const MSK_UTC_OFFSET = "+03:00" as const;

export function toDayKeyInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function consultationMskDayKey(date: Date): string {
  return toDayKeyInTimezone(date, CONSULTATION_TIMEZONE);
}

export function consultationCalendarMonthKey(date: Date): string {
  return toDayKeyInTimezone(date, CONSULTATION_TIMEZONE).slice(0, 7);
}

export function consultationCalendarMonthKeyFromDayKey(dayKey: string): string {
  const date = consultationMskDayKeyToDate(dayKey);
  if (Number.isNaN(date.getTime())) {
    return dayKey.slice(0, 7);
  }
  return consultationCalendarMonthKey(date);
}

export function consultationMskDayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) {
    return new Date("invalid");
  }
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function consultationMskDayStartUtc(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000${MSK_UTC_OFFSET}`);
}

function consultationMskDayEndUtc(dayKey: string): Date {
  return new Date(`${dayKey}T23:59:59.999${MSK_UTC_OFFSET}`);
}

export function addDaysToConsultationMskDayKey(dayKey: string, days: number): string {
  const d = consultationMskDayStartUtc(dayKey);
  d.setUTCDate(d.getUTCDate() + days);
  return consultationMskDayKey(d);
}

export function consultationBookingCalendarWindowMsk(daysForward = 14, now = new Date()) {
  const todayKey = consultationMskDayKey(now);
  const fromKey = addDaysToConsultationMskDayKey(todayKey, 1);
  const toKey = addDaysToConsultationMskDayKey(fromKey, daysForward);
  return {
    fromKey,
    toKey,
    fromUtc: consultationMskDayStartUtc(fromKey),
    toUtc: consultationMskDayEndUtc(toKey),
  };
}

export function formatConsultationTimeMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(date);
}

export function formatConsultationMonthLabelMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(date);
}

export function formatConsultationDayLabelMsk(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(date);
}

function isValidTimeMs(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

export function formatConsultationListDateTimeMsk(iso: string): string {
  const d = new Date(iso);
  if (!isValidTimeMs(d)) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(d);
}

export function formatConsultationConfirmSlotMsk(startAtUtc?: string, endAtUtc?: string): string {
  if (!startAtUtc || !endAtUtc) {
    return "Время будет подтверждено при бронировании";
  }
  const start = new Date(startAtUtc);
  const end = new Date(endAtUtc);
  if (!isValidTimeMs(start) || !isValidTimeMs(end)) {
    return "Время будет подтверждено при бронировании";
  }
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(start);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CONSULTATION_TIMEZONE,
  });
  return `${date}, ${time.format(start)} - ${time.format(end)} (МСК)`;
}

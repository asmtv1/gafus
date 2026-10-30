export const MOBILE_INTRO_TIME_ZONE = "Europe/Samara" as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAMARA_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

export type MobileIntroDateRange = {
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
};

function formatSamaraDate(date: Date): string {
  return new Date(date.getTime() + SAMARA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** The date fields are calendar days in Samara, converted to a half-open UTC interval. */
export function samaraDayStart(value: string): Date {
  if (!isValidDate(value)) throw new Error("Некорректная дата");
  return new Date(`${value}T00:00:00.000+04:00`);
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function getDefaultMobileIntroDateRange(now = new Date()): MobileIntroDateRange {
  const endDate = formatSamaraDate(now);
  const startDate = addDays(endDate, -29);
  return {
    startDate,
    endDate,
    start: samaraDayStart(startDate),
    end: samaraDayStart(addDays(endDate, 1)),
  };
}

export function parseMobileIntroDateRange(
  startValue: string | string[] | undefined,
  endValue: string | string[] | undefined,
  now = new Date(),
): MobileIntroDateRange {
  const defaultRange = getDefaultMobileIntroDateRange(now);
  const startDate = Array.isArray(startValue) ? startValue[0] : startValue;
  const endDate = Array.isArray(endValue) ? endValue[0] : endValue;

  if (!startDate && !endDate) return defaultRange;
  if (
    !startDate ||
    !endDate ||
    !isValidDate(startDate) ||
    !isValidDate(endDate) ||
    startDate > endDate
  ) {
    return defaultRange;
  }

  return {
    startDate,
    endDate,
    start: samaraDayStart(startDate),
    end: samaraDayStart(addDays(endDate, 1)),
  };
}

export const PROFIT_START_DAY = "2026-09-01";
export const PROFIT_START = new Date("2026-09-01T00:00:00+04:00");
export const VIDEO_PRICE_KOPECKS = 50_000;
export const PROFIT_TIMEZONE = "Europe/Samara";

export function samaraDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PROFIT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dayStart(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Некорректная дата");
  const date = new Date(`${day}T00:00:00+04:00`);
  if (!Number.isFinite(date.getTime()) || samaraDay(date) !== day)
    throw new Error("Некорректная дата");
  return date;
}

export function profitPeriod(from?: string, to?: string, now = new Date()) {
  const today = samaraDay(now);
  const startDay = from || today.slice(0, 7) + "-01";
  const endDay = to || today;
  if (startDay < PROFIT_START_DAY || endDay > today || startDay > endDay) {
    throw new Error("Период должен быть между 1 сентября 2026 года и сегодняшним днём");
  }
  const start = dayStart(startDay);
  const end = new Date(dayStart(endDay).getTime() + 86_400_000);
  return { from: startDay, to: endDay, start, end };
}

/** Provider money must be exact RUB cents. Reject malformed or fractional kopecks. */
export function moneyKopecks(value: unknown): number {
  const text = String(value ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Некорректная денежная сумма");
  const [rub, fraction = ""] = text.split(".");
  const amount = Number(rub) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Слишком большая сумма");
  return amount;
}

export function npdKopecks(amount: number): number {
  return Math.floor((amount * 4 + 50) / 100);
}

export function serverExpenseKopecks(start: Date, end: Date, now = new Date()): number {
  const current = samaraDay(start).slice(0, 7).split("-").map(Number);
  let year = current[0];
  let month = current[1];
  let total = 0;
  while (true) {
    const date = dayStart(`${year}-${String(month).padStart(2, "0")}-18`);
    if (date >= end || date > now) break;
    if (date >= start && date >= PROFIT_START) total += 42_900;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return total;
}

export type ProfitTotals = {
  payments: number;
  refunds: number;
  yookassa: number;
  npd: number;
  partners: number;
  videos: number;
  server: number;
};

export function calculateProfit(totals: ProfitTotals): number {
  return (
    totals.payments -
    totals.refunds -
    totals.yookassa -
    totals.npd -
    totals.partners -
    totals.videos -
    totals.server
  );
}

/** Pure DailyCourse date/description transformations. Business writes,
 * transaction scope, ownership and schedule CAS remain in the existing Core
 * service; these functions have no DB or provider dependencies.
 */
export function getMoscowDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Не удалось определить московскую дату");
  }
  return `${year}-${month}-${day}`;
}


export function dateKeyToDate(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("INVALID_DATE");
  }
  return new Date(`${dateKey}T00:00:00.000Z`);
}


export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}


export function getTodayDate(): Date {
  return dateKeyToDate(getMoscowDateKey());
}


export function cleanDailyCourseMarkdownDescription(description: string): string {
  const trimmed = description.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const fenced = unquoted.match(/^`{2,3}[a-z0-9_-]*\s*\n([\s\S]*?)\n`{2,3}$/i);
  return fenced ? fenced[1].trim() : description;
}

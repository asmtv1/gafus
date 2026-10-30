/** Client-only equivalent of Next's daily-course Moscow date default. */
export function moscowDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => parts.find(item => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDateKey(input: string | undefined): input is string {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
}

/** URL wins over a test-injected date; malformed input never generates invalid Hono ranges. */
export function initialDailyCalendarFrom(
  search?: string, injected?: string, now: Date = new Date(),
) {
  const fromUrl = new URLSearchParams(search ?? "").get("from") ?? undefined;
  return validDateKey(fromUrl) ? fromUrl :
    validDateKey(injected) ? injected : moscowDateKey(now);
}

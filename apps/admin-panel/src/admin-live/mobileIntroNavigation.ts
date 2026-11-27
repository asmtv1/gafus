import {
  getDefaultMobileIntroDateRange,
  parseMobileIntroDateRange,
} from "./support/dateRange";

export type MobileDateFilter = { startDate: string; endDate: string };
const MOBILE_INTRO_ROUTE = "/main-panel/mobile-intro";
/** Match the historical Next URL filter: invalid or incomplete ranges fall back safely. */
export function mobileIntroFilterFromSearch(search: string, now = new Date()): MobileDateFilter {
  const query = new URLSearchParams(search);
  const range = parseMobileIntroDateRange(query.get("start") ?? undefined, query.get("end") ?? undefined, now);
  return { startDate: range.startDate, endDate: range.endDate };
}
export function mobileIntroRouteUrl(range: MobileDateFilter): string {
  // Reject malformed dates instead of placing an invalid range into browser history.
  mobileIntroReportUrl(range);
  return `${MOBILE_INTRO_ROUTE}?${new URLSearchParams({ start: range.startDate, end: range.endDate })}`;
}
export function defaultMobileDateFilter(now = new Date()): MobileDateFilter {
  const { startDate, endDate } = getDefaultMobileIntroDateRange(now);
  return { startDate, endDate };
}
/** Existing Next date parser: half-open midnight interval in Samara (+04:00). */
export function mobileIntroReportUrl(range: MobileDateFilter): string {
  const parsed = parseMobileIntroDateRange(range.startDate, range.endDate);
  if (parsed.startDate !== range.startDate || parsed.endDate !== range.endDate) {
    throw new Error("Некорректный период отчёта");
  }
  return (
    "/api/v1/mobile-intro/admin/report?" +
    new URLSearchParams({
      start: parsed.start.toISOString(),
      end: parsed.end.toISOString(),
    }).toString()
  );
}

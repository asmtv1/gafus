/** Historical Next profit period deep link, normalized for Hono's strict filter DTO. */
export const PROFIT_ROUTE = "/main-panel/profit";
const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;
function isDay(day: string | null): day is string {
  return !!day && YYYYMMDD.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day &&
    day >= "2026-09-01" && day <= new Date().toISOString().slice(0, 10);
}
export function profitSearchFromLocation(search: string): string {
  const raw = new URLSearchParams(search);
  const result = new URLSearchParams();
  const from = raw.get("from");
  const to = raw.get("to");
  // Original Next falls back to the current default period on invalid dates.
  if (isDay(from) && isDay(to) && from <= to) {
    result.set("from", from);
    result.set("to", to);
  }
  for (const key of ["paymentPage", "videoPage"]) {
    const value = raw.get(key);
    if (value && /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 10000) {
      result.set(key, String(Number(value)));
    }
  }
  return result.toString();
}
export function profitApiUrl(search: string): string {
  const normalized = profitSearchFromLocation(search);
  return `/api/v1/admin/profit${normalized ? `?${normalized}` : ""}`;
}

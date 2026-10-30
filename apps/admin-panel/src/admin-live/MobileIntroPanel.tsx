import { useEffect, useState, type FormEvent } from "react";
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
type MobileIntroReport = {
  timeZone: "Europe/Samara";
  range: { start: string; end: string };
  generatedAt: string;
  openings: number;
  completed: number;
  skipped: number;
  registered: number;
  loggedIn: number;
  pendingAuth: number;
};
const metrics = [
  ["openings", "Открыли презентацию"],
  ["completed", "Завершили"],
  ["skipped", "Пропустили"],
  ["registered", "Зарегистрировались"],
  ["loggedIn", "Вошли в существующий аккаунт"],
  ["pendingAuth", "Пока без входа и регистрации"],
] as const;
function asReport(value: unknown): MobileIntroReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.timeZone !== "Europe/Samara" ||
    !row.range ||
    metrics.some(
      ([key]) =>
        typeof row[key] !== "number" ||
        !Number.isFinite(row[key] as number) ||
        (row[key] as number) < 0,
    )
  )
    return null;
  return value as MobileIntroReport;
}
function rate(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—";
}

export function MobileIntroPanel({
  data,
  range,
  onApply,
}: {
  data: unknown;
  range: MobileDateFilter;
  onApply: (range: MobileDateFilter) => void;
}) {
  const [startDate, setStartDate] = useState(range.startDate);
  const [endDate, setEndDate] = useState(range.endDate);
  const [error, setError] = useState<string | null>(null);
  // Next shared the selected report period through URL query params.
  // Keep Vite in sync on direct links and on browser history navigation.
  useEffect(() => {
    const syncFromUrl = () => {
      if (window.location.pathname !== MOBILE_INTRO_ROUTE) return;
      const next = mobileIntroFilterFromSearch(window.location.search);
      setStartDate(next.startDate);
      setEndDate(next.endDate);
      if (next.startDate !== range.startDate || next.endDate !== range.endDate) onApply(next);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [onApply, range.startDate, range.endDate]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const filter = { startDate, endDate };
    try {
      const route = mobileIntroRouteUrl(filter);
      window.history.replaceState(null, "", route);
      onApply(filter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Некорректные даты");
    }
  }
  const report = asReport(data);
  return (
    <section className="content-card">
      <h2>Первый запуск мобильного приложения</h2>
      <p className="note">Период в календарных днях Самары (UTC+4), включая обе выбранные даты.</p>
      <form className="inline-form" onSubmit={apply}>
        <label>
          С
          <input
            required
            type="date"
            max={endDate}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          По
          <input
            required
            type="date"
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button type="submit">Показать отчёт</button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!report ? (
        <p role="alert">Некорректный формат отчёта первого запуска</p>
      ) : (
        <>
          <p className="note">
            Регистрации и входы учитываются по состоянию на момент обновления отчёта, даже если они
            произошли после выбранного периода.
          </p>
          {report.openings === 0 && (
            <p role="status" className="note">
              За выбранный период нет установок, впервые открывших вступительную презентацию.
            </p>
          )}
          <div className="metric-grid">
            {metrics.map(([key, title]) => (
              <article className="metric" key={key}>
                <span>{title}</span>
                <strong>{report[key].toLocaleString("ru-RU")}</strong>
                <small>{rate(report[key], report.openings)} от открытий</small>
              </article>
            ))}
          </div>
          <section className="nested-section">
            <h3>Воронка регистрации и входа</h3>
            <p className="note">
              Завершение и пропуск — результаты просмотра. Регистрация и вход — независимые
              результаты авторизации.
            </p>
            {metrics.map(([key, title]) => {
              const count = report[key];
              const percentage =
                report.openings > 0 ? Math.min(100, (count / report.openings) * 100) : 0;
              return (
                <div className="funnel-row" key={key}>
                  <div className="funnel-label">
                    <span>{title}</span>
                    <strong>
                      {count.toLocaleString("ru-RU")} · {rate(count, report.openings)}
                    </strong>
                  </div>
                  <div
                    className="funnel-track"
                    role="progressbar"
                    aria-label={title}
                    aria-valuemin={0}
                    aria-valuemax={report.openings}
                    aria-valuenow={Math.min(count, report.openings)}
                  >
                    <div className="funnel-fill" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </section>
  );
}

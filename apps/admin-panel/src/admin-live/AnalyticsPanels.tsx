import { useEffect, useRef, useState, type FormEvent } from "react";
import { DataTable } from "./DataPanel";
import { AdminHttpError, requestAdmin } from "./api";

type RewardSummary = {
  sessions: number;
  loaded: number;
  shown: number;
  rewarded: number;
  granted: number;
  skipped: number;
  failed: number;
  uniqueUsers: number;
  uniqueShownUsers?: number;
  uniqueRewardedUsers?: number;
  uniqueSkippedUsers?: number;
  loadRate?: number;
  showRate?: number;
  completionRate: number;
  grantRate?: number;
  skipRate: number;
};
type RewardTarget = RewardSummary & {
  targetId: string;
  targetType: string;
  title: string;
  context: string | null;
};
type RewardData = {
  generatedAt: string;
  range: { days: number; start: string; end: string };
  settings: { androidEnabled: boolean; iosEnabled: boolean; testMode: boolean };
  today: {
    shown: number;
    rewarded: number;
    skipped: number;
    failed: number;
    granted?: number;
    uniqueShownUsers?: number;
    uniqueRewardedUsers?: number;
    uniqueSkippedUsers?: number;
    sessionsStarted: number;
  };
  period: RewardSummary;
  byPlatform: (RewardSummary & { platform: string })[];
  byTarget: RewardTarget[];
  daily: {
    date: string;
    sessions: number;
    shown: number;
    rewarded: number;
    skipped: number;
    failed: number;
    completionRate: number;
  }[];
  failures: { code: string; count: number }[];
};
type ReengageData = {
  overview: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalNotificationsSent: number;
    clickedNotifications: number;
    returnedUsers: number;
    unsubscribedUsers: number;
    clickRate: number;
    returnRate: number;
  };
  byLevel: Record<string, { sent: number; clicked: number; clickRate: number }>;
  byType: Record<string, { sent: number; clicked: number; clickRate: number }>;
  recentCampaigns: {
    id: string;
    userName: string | null;
    campaignStartDate: string;
    level: number;
    notificationsSent: number;
    clicked: number;
    returned: boolean;
    unsubscribed: boolean;
    isActive: boolean;
  }[];
};
const number = (n: number) => n.toLocaleString("ru-RU");
const metric = (label: string, value: string | number) => (
  <article className="metric" key={label}>
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
);
function isReward(data: unknown): data is RewardData {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const value = data as Partial<RewardData>;
  const summary = value.period;
  const today = value.today;
  return Boolean(
    value.range && [7, 30, 90].includes(value.range.days) &&
    value.settings && typeof value.settings.androidEnabled === "boolean" &&
    typeof value.settings.iosEnabled === "boolean" &&
    typeof value.settings.testMode === "boolean" &&
    summary && [summary.sessions, summary.loaded, summary.shown, summary.rewarded,
      summary.granted, summary.skipped, summary.failed, summary.completionRate]
      .every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0) &&
    today && [today.shown, today.rewarded, today.skipped, today.failed]
      .every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0) &&
    Array.isArray(value.byPlatform) && Array.isArray(value.byTarget) &&
    Array.isArray(value.daily) && Array.isArray(value.failures)
  );
}
const ECPM_STORAGE_KEY = "gafus:admin:rewarded-ads:ecpm-rub:v1";
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });
const moscowTimestamp = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Moscow",
});
function count(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function percentage(value: number | undefined) {
  return `${count(value).toFixed(1)}%`;
}
export function RewardedAdsPanel({ source }: { source: unknown }) {
  const [ecpm, setEcpm] = useState("500");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ECPM_STORAGE_KEY);
      if (saved !== null && Number.isFinite(Number(saved)) && Number(saved) >= 0)
        setEcpm(String(Number(saved)));
    } catch {
      // Archival analytics must remain functional without localStorage.
    }
  }, []);
  const updateEcpm = (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) return;
    setEcpm(String(next));
    try { window.localStorage.setItem(ECPM_STORAGE_KEY, String(next)); }
    catch { /* The browser may disable storage. */ }
  };
  if (!isReward(source)) return <p role="alert">Неверный формат рекламной аналитики</p>;
  const data = source;
  const rubles = (shown: number) => money.format(Math.round(shown * Number(ecpm) / 10) / 100);
  const displayTime = new Date(data.generatedAt);
  const days = data.daily.slice(-14);
  const maxDay = Math.max(0, ...days.map((day) => day.rewarded));
  const funnel = [
    ["Создали сессию", data.period.sessions, undefined],
    ["Реклама загрузилась", data.period.loaded, data.period.loadRate],
    ["Показ начался", data.period.shown, data.period.showRate],
    ["Досмотрели до награды", data.period.rewarded, data.period.completionRate],
    ["Доступ выдан", data.period.granted, data.period.grantRate],
  ] as const;
  return (
    <div className="panel-stack">
      <section className="content-card">
        <h2>Архивная аналитика rewarded-рекламы</h2>
        <p className="note">История прежней рекламной модели доступна только для чтения. Новые рекламные кредиты и гафусы здесь не начисляются.</p>
        <p className="note">Период: {data.range.days} дней ({data.range.start} — {data.range.end})
          {Number.isFinite(displayTime.getTime()) ? ` · Обновлено ${moscowTimestamp.format(displayTime)} (Москва)` : ""}
        </p>
        <div className="filter-toolbar" aria-label="Исторические параметры рекламы">
          <span className="status-pill">Android: {data.settings.androidEnabled ? "включена" : "выключена"}</span>
          <span className="status-pill">iOS: {data.settings.iosEnabled ? "включена" : "выключена"}</span>
          <span className="status-pill">{data.settings.testMode ? "Тестовый режим" : "Боевой режим"}</span>
        </div>
        {data.settings.testMode && <p role="note" className="note">Исторические тестовые и боевые показы нельзя разделить: режим не записывался в каждую сессию.</p>}
        <h3>Сегодня по Москве</h3>
        <div className="metric-grid">
          {metric("Пользователи досмотрели", number(count(data.today.uniqueRewardedUsers)))}
          {metric("Начали смотреть", number(count(data.today.uniqueShownUsers)))}
          {metric("Скипнули", number(count(data.today.uniqueSkippedUsers)))}
          {metric("Доступ выдан", number(count(data.today.granted)))}
          {metric("Ошибки рекламы", number(data.today.failed))}
          {metric("Оценка выручки сегодня", `≈ ${rubles(data.today.shown)}`)}
        </div>
        <p className="note">Завершённых просмотров сегодня: {number(data.today.rewarded)}; показов: {number(data.today.shown)}.</p>
      </section>
      <section className="content-card">
        <h2>Сценарная оценка выручки</h2>
        <p className="note">Используется число событий SHOWN с мобильных клиентов × предполагаемый eCPM / 1000. Это не отчёт рекламной сети и не подтверждённый доход.</p>
        <label>
          Ожидаемый eCPM, ₽
          <input type="number" min="0" step="50" value={ecpm} onChange={(e) => updateEcpm(e.target.value)} />
        </label>
        <div className="metric-grid">{metric(`Оценка за ${data.range.days} дней`, `≈ ${rubles(data.period.shown)}`)}</div>
      </section>
      <section className="content-card">
        <h2>Воронка рекламных сессий за {data.range.days} дней</h2>
        <p className="note">Сессии, начатые в выбранном периоде. Конверсия — переход с предыдущего этапа.</p>
        {funnel.map(([label, value, conversion]) => (
          <div className="funnel-row" key={label}>
            <div className="funnel-label">
              <span>{label}</span>
              <strong>{number(value)}{conversion === undefined ? "" : ` · ${percentage(conversion)}`}</strong>
            </div>
            <div className="funnel-track" role="progressbar" aria-label={label}
              aria-valuemin={0}
              aria-valuemax={Math.max(1, data.period.sessions)}
              aria-valuenow={Math.min(value, Math.max(1, data.period.sessions))}>
              <div className="funnel-fill" style={{ width: `${data.period.sessions > 0 ? Math.min(100, value / data.period.sessions * 100) : 0}%` }} />
            </div>
          </div>
        ))}
        <p className="note">Скипы: {number(data.period.skipped)} · Ошибки: {number(data.period.failed)} · Пользователей: {number(data.period.uniqueUsers)}</p>
      </section>
      <section className="content-card">
        <h2>По платформам</h2>
        <div className="metric-grid">
          {data.byPlatform.map((platform) => (
            <article className="metric" key={platform.platform}>
              <strong>{platform.platform === "ANDROID" ? "Android" : "iOS"}</strong>
              <span>Сессии: {number(platform.sessions)}</span>
              <span>Показы: {number(platform.shown)}</span>
              <span>
                Досмотры: {number(platform.rewarded)} ({percentage(platform.completionRate)})
              </span>
              <span>Скипы: {number(platform.skipped)} ({percentage(platform.skipRate)})</span>
              <span>Ошибки: {number(platform.failed)}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="content-card">
        <h2>Досмотры по дням</h2>
        <p className="note">Последние {days.length} дней; справа указаны досмотры / показы.</p>
        {days.length === 0 ? <p className="note">За период просмотров не было.</p> : days.map((day) => (
          <div className="funnel-row" key={day.date}>
            <div className="funnel-label"><span>{day.date}</span><strong>{number(day.rewarded)} / {number(day.shown)}</strong></div>
            <div className="funnel-track" role="progressbar" aria-label={`Досмотры ${day.date}`}
              aria-valuemin={0} aria-valuemax={Math.max(1, maxDay)} aria-valuenow={day.rewarded}>
              <div className="funnel-fill" style={{ width: `${maxDay ? Math.min(100, day.rewarded / maxDay * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </section>
      <section className="content-card">
        <h2>Эффективность по материалам</h2>
        <p className="note">Материалы, которые прежде открывали за рекламу.</p>
        <div className="table-scroll"><table><thead><tr><th>Материал</th><th>Сессии</th><th>Показы</th><th>Досмотры</th><th>Конверсия</th><th>Скипы</th><th>Ошибки</th><th>Оценка</th></tr></thead>
          <tbody>{data.byTarget.length === 0 ? (
            <tr><td colSpan={8}>За выбранный период сессий не было.</td></tr>
          ) : data.byTarget.map((target) => (
            <tr key={`${target.targetType}:${target.targetId}`}>
              <td>
                <strong>{target.title}</strong>
                <small style={{ display: "block" }}>{target.context ?? target.targetType}</small>
              </td>
              <td>{number(target.sessions)}</td>
              <td>{number(target.shown)}</td>
              <td>{number(target.rewarded)}</td>
              <td>{percentage(target.completionRate)}</td><td>{number(target.skipped)}</td>
              <td>{number(target.failed)}</td><td>≈ {rubles(target.shown)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {data.failures.length > 0 && <section className="content-card">
        <h2>Основные ошибки</h2>
        <div className="filter-toolbar">{data.failures.map((failure) => (
          <span key={failure.code} className="status-pill">{failure.code}: {number(failure.count)}</span>
        ))}</div>
      </section>}
      <p className="note">SHOWN не является независимым отчётом Яндекса. Архив не выдаёт доступ или вознаграждения и не изменяет параметры рекламной сети.</p>
    </div>
  );
}
function isReengage(data: unknown): data is ReengageData {
  return (
    data !== null &&
    typeof data === "object" &&
    "overview" in data &&
    "byLevel" in data &&
    "byType" in data &&
    "recentCampaigns" in data &&
    Array.isArray((data as { recentCampaigns?: unknown }).recentCampaigns)
  );
}
export function ReengagementPanel({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [latestMetrics, setLatestMetrics] = useState<ReengageData | null>(null);
  // A 5xx or lost ACK does not prove that the scheduler did not enqueue work.
  // Prevent blind retries until an operator explicitly reloads this screen.
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const launchLock = useRef(false);
  if (!isReengage(source)) return <p role="alert">Неверный формат метрик возврата пользователей</p>;
  const data = latestMetrics ?? source;
  async function launch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || launchLock.current || outcomeUnknown || confirmation !== "ЗАПУСТИТЬ") return;
    if (
      !window.confirm(
        "Запустить проверку неактивных пользователей и постановку уведомлений в очередь?",
      )
    )
      return;
    launchLock.current = true;
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const result = await requestAdmin<{
        newCampaigns: number;
        scheduledNotifications: number;
        closedCampaigns: number;
      }>("/api/v1/admin/reengagement/run", {
        method: "POST",
        body: { confirmation: "RUN_REENGAGEMENT" },
      });
      setSummary(`Новых кампаний: ${result.newCampaigns}; запланировано уведомлений:
        ${result.scheduledNotifications}; закрыто кампаний: ${result.closedCampaigns}`);
      setConfirmation("");
      // Parent reload unmounts the panel and erases a successful run summary.
      // Read fresh metrics locally so the completion receipt stays visible.
      try {
        const updated = await requestAdmin<ReengageData>(
          "/api/v1/admin/analytics/reengagement",
        );
        if (isReengage(updated)) setLatestMetrics(updated);
      } catch {
        // Sending succeeded; a dashboard refresh failure must not erase its receipt.
      }
    } catch (cause) {
      const definiteRejection =
        cause instanceof AdminHttpError &&
        [400, 401, 403, 409, 422, 429].includes(cause.status) &&
        cause.code !== "INVALID_RESPONSE";
      if (!definiteRejection) {
        setOutcomeUnknown(true);
        setConfirmation("");
      }
      setError(definiteRejection
        ? cause.message
        : "Неизвестен результат запуска: уведомления могли быть поставлены в очередь. " +
          "Не запускайте повторно без проверки состояния фоновой очереди.");
    } finally {
      launchLock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="panel-stack">
      <section className="content-card">
        <h2>Мониторинг возврата пользователей</h2>
        <div className="metric-grid">
          {metric("Всего кампаний", number(data.overview.totalCampaigns))}
          {metric("Активные", number(data.overview.activeCampaigns))}
          {metric("Уведомлений", number(data.overview.totalNotificationsSent))}
          {metric("Клики", number(data.overview.clickedNotifications))}
          {metric("Вернувшиеся", number(data.overview.returnedUsers))}
          {metric("Отписались", number(data.overview.unsubscribedUsers))}
          {metric("CTR", `${data.overview.clickRate.toFixed(1)}%`)}
          {metric("Возвращаемость", `${data.overview.returnRate.toFixed(1)}%`)}
        </div>
      </section>
      <section className="content-card">
        <h2>По уровням кампаний</h2>
        <DataTable
          rows={Object.entries(data.byLevel).map(([level, values]) => ({ level, ...values }))}
          title="Уровни"
        />
      </section>
      <section className="content-card">
        <h2>По типам уведомлений</h2>
        <DataTable
          rows={Object.entries(data.byType).map(([type, values]) => ({ type, ...values }))}
          title="Типы"
        />
      </section>
      <section className="content-card">
        <h2>Последние кампании</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Дата старта</th>
                <th>Уровень</th>
                <th>Отправлено</th>
                <th>Открыто</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {data.recentCampaigns.length === 0 ? (
                <tr><td colSpan={6}>Кампаний пока нет</td></tr>
              ) : data.recentCampaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.userName || "Неизвестен"}</td>
                  <td>{new Date(campaign.campaignStartDate).toLocaleDateString("ru-RU")}</td>
                  <td>Уровень {campaign.level}</td>
                  <td>{campaign.notificationsSent}</td>
                  <td>{campaign.clicked}</td>
                  <td>
                    {campaign.returned && <span className="status-pill active">Вернулся</span>}
                    {campaign.unsubscribed && <span className="status-pill">Отписался</span>}
                    {!campaign.returned && !campaign.unsubscribed && (
                      <span
                        className={campaign.isActive ? "status-pill active" : "status-pill"}
                      >
                        {campaign.isActive ? "Активна" : "Завершена"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-card">
        <div className="funnel-label"><h2>Ручной запуск планировщика</h2>
          <button type="button" onClick={onSaved} disabled={pending}>Обновить статистику</button>
        </div>
        <p className="note">
          Только ADMIN. Redis-блокировка предотвращает двойной ручной запуск. Это может создать
          кампании и поставить уведомления в очередь.
        </p>
        <form onSubmit={launch} className="operation subscription-form">
          <label>
            Введите ЗАПУСТИТЬ
            <input
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button type="submit" disabled={pending || outcomeUnknown || confirmation !== "ЗАПУСТИТЬ"}>
            {pending ? "Запускаем…" : "Запустить планировщик"}
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {outcomeUnknown && (
          <p className="note" role="status">
            Повторный запуск заблокирован до повторного открытия раздела. Сначала проверьте
            фоновые задания и фактическую доставку, а не только показатели дашборда.
          </p>
        )}
        {summary && (
          <p role="status" className="success">
            {summary}
          </p>
        )}
      </section>
    </div>
  );
}
export function BroadcastPanel({ source }: { source: unknown }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // Preserve the action identity on retries after a timeout or uncertain response.
  const attemptKey = useRef<string | null>(null);
  const onEdit = () => { attemptKey.current = null; setSent(null); };
  if (!source || typeof source !== "object" || !("subscriptions" in source)) {
    return <p role="alert">Нет данных о push-подписках</p>;
  }
  const count = Number((source as { subscriptions: number }).subscriptions);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || confirmation !== "РАССЫЛКА") return;
    if (
      !window.confirm(
        "ОТПРАВИТЬ push-уведомление всем подпискам? Одинаковый запрос с прежним ключом повторно не отправляется.",
      )
    )
      return;
    setPending(true);
    setError(null);
    setSent(null);
    attemptKey.current ??= crypto.randomUUID();
    try {
      const result = await requestAdmin<{
        totalUsers: number;
        sentCount: number;
        failedCount: number;
      }>("/api/v1/admin/broadcasts", {
        method: "POST",
        body: {
          title: title.trim(),
          body: body.trim(),
          ...(url.trim() ? { url: url.trim() } : {}),
          confirmation: "SEND_TO_ALL_SUBSCRIBERS",
          idempotencyKey: attemptKey.current,
        },
      });
      attemptKey.current = null;
      setSent(
        `Отправлено: ${result.sentCount} из ${result.totalUsers}. Ошибок: ${result.failedCount}`,
      );
      setTitle("");
      setBody("");
      setUrl("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Массовая push-рассылка</h2>
      <p className="note">
        Сырых записей push-подписок: {count}. Это не число уникальных пользователей или
        гарантированных доставок. Отправка использует Web Push, Expo и RuStore.
      </p>
      <form onSubmit={send} className="operation subscription-form">
        <label>
          Заголовок уведомления · {title.length}/100
          <input
            required
            maxLength={100}
            placeholder="Например: Новый курс доступен!"
            value={title}
            onChange={(e) => { onEdit(); setTitle(e.target.value); }}
          />
        </label>
        <label>
          Текст уведомления · {body.length}/300
          <textarea
            required
            maxLength={300}
            placeholder="Например: Мы добавили новый курс по дрессировке щенков"
            rows={4}
            value={body}
            onChange={(e) => { onEdit(); setBody(e.target.value); }}
          />
        </label>
        <label>
          Путь внутри приложения (необязательно)
          <input
            maxLength={512}
            placeholder="/courses"
            value={url}
            onChange={(e) => { onEdit(); setUrl(e.target.value); }}
          />
        </label>
        <p className="note">
          Рассылка необратима. Повтор после сетевого сбоя использует прежний ключ запроса.
          При неопределённой доставке сервер запретит повторную отправку.
        </p>
        <label>
          Введите РАССЫЛКА для подтверждения
          <input required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <button disabled={pending || confirmation !== "РАССЫЛКА"} type="submit">
          {pending ? "Отправка…" : "Отправить всем"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="success">
          {sent}
        </p>
      )}
    </section>
  );
}

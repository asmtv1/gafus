import { useEffect, useRef, useState } from "react";
import { DataTable } from "./DataPanel";
import { AdminHttpError, requestAdmin } from "./api";

type Stats = Record<string, number>;
const storageGroups = [
  {
    title: "Общая статистика",
    fields: [
      ["totalExamResults", "Всего экзаменов"],
      ["withVideo", "С видео (активных)"],
      ["withoutVideo", "Без видео"],
      ["deletedVideos", "Видео удалено"],
    ],
  },
  {
    title: "По статусам экзаменов",
    fields: [
      ["completedWithVideo", "Завершены с видео"],
      ["pendingWithVideo", "Ожидают проверки, с видео"],
    ],
  },
  {
    title: "Кандидаты на автоудаление",
    fields: [
      ["completedOlderThan30Days", "Зачтенные старше 30 дней"],
      ["pendingOlderThan90Days", "Незачтенные старше 90 дней"],
    ],
  },
  {
    title: "Причины удаления видео",
    fields: [
      ["deletedByReplacement", "Удалено при замене"],
      ["deletedByAutoCleanupCompleted", "Завершённые (автоочистка)"],
      ["deletedByAutoCleanupPending", "Ожидающие (автоочистка)"],
    ],
  },
] as const;
function numericStats(data: unknown): Stats | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const stats = data as Record<string, unknown>;
  if (
    storageGroups.some((group) =>
      group.fields.some(
        ([key]) => typeof stats[key] !== "number" ||
        !Number.isSafeInteger(stats[key] as number) || (stats[key] as number) < 0,
      ),
    )
  )
    return null;
  return stats as Stats;
}
export function StoragePanel({ data }: { data: unknown }) {
  const stats = numericStats(data);
  if (!stats) return <p role="alert">Некорректный формат статистики хранения видео</p>;
  return (
    <div className="content-card">
      <h2>Управление хранилищем видео</h2>
      <p className="note">
        Статистика и мониторинг хранения видео экзаменов. Автоматическая очистка проверяется
        ежедневно в 03:00 по московскому времени.
      </p>
      {storageGroups.map((group) => (
        <section key={group.title} className="nested-section">
          <h3>{group.title}</h3>
          {group.title === "Кандидаты на автоудаление" && (
            <p className="note">
              Это показатели кандидатов, а не ручное удаление. Очистка происходит отдельно.
            </p>
          )}
          <div className="metric-grid">
            {group.fields.map(([key, title]) => (
              <article className="metric" key={key}>
                <span>{title}</span>
                <strong>{stats[key].toLocaleString("ru-RU")}</strong>
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="note">
        Зачтенные видео хранятся 30 дней после зачета, незачтенные — 90 дней после создания.
        При замене файла старое видео удаляется. Автоочистка запускается ежедневно в 03:00 МСК.
      </p>
    </div>
  );
}

export function AdminStorageSection() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    requestAdmin("/api/v1/admin/media/stats", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить хранилище");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  if (loading) return <p role="status">Проверяем видео экзаменов…</p>;
  if (error)
    return (
      <div className="content-card">
        <p className="error" role="alert">{error}</p>
        <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
          Повторить чтение статистики
        </button>
      </div>
    );
  return <StoragePanel data={data} />;
}

type MailDashboard = {
  updatedAt: string;
  summary: {
    attention: number;
    pending: number;
    processing: number;
    sent24h: number;
    unknown: number;
    failed: number;
    expired: number;
    deliveryFailures24h: number;
  };
  outbox: {
    id: string;
    category: string;
    createdAt: string;
    attempts: number;
    status: string;
    code: string | null;
  }[];
  attempts: { id: string; createdAt: string; status: string; code: string | null }[];
  events: { receivedAt: string; type: string; code: string | null }[];
};
function mailDashboard(data: unknown): MailDashboard | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const mail = data as Record<string, unknown>;
  if (typeof mail.updatedAt !== "string" || !mail.summary ||
      typeof mail.summary !== "object" || Array.isArray(mail.summary) ||
      !Array.isArray(mail.outbox) || !Array.isArray(mail.attempts) ||
      !Array.isArray(mail.events)) return null;
  const summary = mail.summary as Record<string, unknown>;
  const keys = ["attention", "pending", "processing", "sent24h", "unknown",
    "failed", "expired", "deliveryFailures24h"] as const;
  if (!keys.every(key => Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0))
    return null;
  const isRow = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!mail.outbox.every(row =>
    isRow(row) && typeof row.id === "string" && typeof row.category === "string" &&
    typeof row.createdAt === "string" && typeof row.status === "string" &&
    Number.isSafeInteger(row.attempts) && Number(row.attempts) >= 0 &&
    (row.code === null || typeof row.code === "string"))) return null;
  if (!mail.attempts.every(row =>
    isRow(row) && typeof row.id === "string" && typeof row.createdAt === "string" &&
    typeof row.status === "string" &&
    (row.code === null || typeof row.code === "string"))) return null;
  if (!mail.events.every(row =>
    isRow(row) && typeof row.receivedAt === "string" && typeof row.type === "string" &&
    (row.code === null || typeof row.code === "string"))) return null;
  return mail as MailDashboard;
}
function fmt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
      }).format(date)
    : value;
}
export function MailPanel({ data, onRefresh }: { data: unknown; onRefresh: () => void }) {
  const mail = mailDashboard(data);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") onRefresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [onRefresh]);
  if (!mail) return <p role="alert">Некорректный формат почтового мониторинга</p>;
  const { summary } = mail;
  const metrics = [
    ["Нужны действия", summary.attention],
    ["В очереди", summary.pending],
    ["Отправляется", summary.processing],
    ["Принято за 24 часа", summary.sent24h],
    ["Неопределённые", summary.unknown],
    ["Ошибки / истекли", summary.failed + summary.expired],
    ["Сбои доставки за 24 часа", summary.deliveryFailures24h],
  ] as const;
  return (
    <section className="content-card mail-panel">
      <h2>Почта и алерты</h2>
      <p className="note">
        Resend · обновление каждые 30 секунд · последнее обновление
        {fmt(mail.updatedAt)} МСК
      </p>
      {summary.attention > 0 ? (
        <p className="error" role="alert">
          Есть проблемные отправки. Проверьте детали ниже: просроченные письма не пересылаются
          автоматически.
        </p>
      ) : (
        <p className="success">Активных ошибок доставки и зависших попыток нет.</p>
      )}
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <article className="metric" key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString("ru-RU")}</strong>
          </article>
        ))}
      </div>
      <section className="nested-section">
        <h3>Очередь писем</h3>
        {!mail.outbox.length && <p className="empty">Проблемных и ожидающих писем нет</p>}
        {mail.outbox.map((row) => (
          <div className="exception-row" key={row.id}>
            <span>
              {row.category} · {row.id} · {fmt(row.createdAt)} · попыток: {row.attempts}
            </span>
            <span className="status-pill">
              {row.code || "—"} · {row.status}
            </span>
          </div>
        ))}
      </section>
      <section className="nested-section">
        <h3>Неопределённые и неудачные обращения к Resend</h3>
        <p className="note">
          UNKNOWN означает отсутствие ответа провайдера, не доказательство потери письма.
        </p>
        {!mail.attempts.length && <p className="empty">Ошибок нет</p>}
        {mail.attempts.map((row) => (
          <div className="exception-row" key={row.id}>
            <span>
              {fmt(row.createdAt)} · {row.id}
            </span>
            <span className="status-pill">
              {row.code || "—"} · {row.status}
            </span>
          </div>
        ))}
      </section>
      <section className="nested-section">
        <h3>Отказы доставки Resend (24 часа)</h3>
        {!mail.events.length && <p className="empty">Событий отказа нет</p>}
        {mail.events.map((event, index) => (
          <p key={index}>
            {fmt(event.receivedAt)} ·{event.type} · {event.code || "без кода"}
          </p>
        ))}
      </section>
      <p className="note">Получатели, вложения, токены и тексты писем не отображаются.</p>
    </section>
  );
}

/** Vite replaces Next page-tag revalidation with durable Core revision checks. */
export function AdminCacheSection({ canChange }: { canChange: boolean }) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [needsVerify, setNeedsVerify] = useState(false);
  const writeLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    requestAdmin("/api/v1/admin/cache", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Не удалось прочитать статистику кэша");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  async function verify() {
    if (writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const snapshot = await requestAdmin<unknown>("/api/v1/admin/cache");
      if (!snapshot || typeof snapshot !== "object" ||
          !("scope" in snapshot) || snapshot.scope !== "HONO_COURSE_CONTENT")
        throw new Error("Некорректный ответ состояния кэша");
      setData(snapshot);
      setNeedsVerify(false);
      setMessage("Сервер доступен. Результат предыдущего обновления ревизии не установлен.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось проверить кэш");
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  async function refresh() {
    if (!canChange || writeLock.current || needsVerify) return;
    if (!window.confirm("Обновить ревизию учебного контента для всех процессов GAFUS API?")) return;
    writeLock.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestAdmin<{ revision: string }>(
        "/api/v1/admin/cache/courses/refresh",
        {
          method: "POST",
          body: { confirmation: "REFRESH_COURSE_CONTENT" },
        },
      );
      if (!/^\d+$/.test(result?.revision ?? ""))
        throw new Error("Некорректный ответ обновления ревизии");
      setMessage(`Ревизия контента обновлена: ${result.revision}. Процессы сверят её при чтении.`);
    } catch (cause) {
      const rejected = cause instanceof AdminHttpError &&
        cause.status >= 400 && cause.status < 500;
      setNeedsVerify(!rejected);
      setError(rejected && cause instanceof Error ? cause.message
        : "Ответ на обновление ревизии неизвестен. Сначала перечитайте сервер, не повторяйте POST.");
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Управление кэшем учебного контента</h2>
      <p className="note">
        Vite/Hono не использует теги Next.js. Все административные API-ответы отправляются с
        no-store. Кэш дней курсов имеет общую PostgreSQL-ревизию.
      </p>
      {loading && <p role="status">Загружаем метрики кэша…</p>}
      {error && (
        <div>
          <p role="alert" className="error">{error}</p>
          <button className="secondary" disabled={loading || saving} onClick={() => {
            setMessage(null);
            setRetry((value) => value + 1);
          }}>
            Перечитать состояние кэша
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {data !== null && (
        <DataTable
          rows={[
            { key: "Режим", value: "Hono shared course content" },
            { key: "Источник ревизии", value: "PostgreSQL" },
          ]}
          title="Текущая архитектура кэша"
        />
      )}
      {canChange && (
        <button
          disabled={saving || loading || !!error || needsVerify}
          onClick={() => void refresh()}
        >
          {saving ? "Обновляем ревизию…" : "Обновить кэш курсов"}
        </button>
      )}
      {needsVerify && (
        <button className="secondary" disabled={saving} onClick={() => void verify()}>
          Проверить сервер перед новым обновлением
        </button>
      )}
      <p className="note">
        Это не меняет пользовательский прогресс, подписки, медиаданные или баланс. Старые Next cache
        tags не инвалидируются через этот endpoint.
      </p>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { FEED_REPORT_REASONS } from "@gafus/types";
import { AdminHttpError, requestAdmin } from "./api";

type FeedReport = {
  id: string;
  targetType: "post" | "comment";
  status: string;
  author: {
    username: string;
    feedPublishingBlocked?: boolean;
  } | null;
  reporter: { username: string } | null;
  createdAt: string;
  reason: string;
  comment: string | null;
  snapshotText: string | null;
  resolution: string | null;
  resolutionReason: string | null;
};
type FeedPage = { items: FeedReport[]; pendingCount: number; nextCursor: string | null };
type QuestionReport = {
  id: string;
  questionTitle: string;
  answerId: string | null;
  author: { name: string };
  reporter: { name: string };
  createdAt: string;
  body: string;
  reason: string;
  details: string | null;
  photos: { id: string; url: string }[];
};
type QuestionBlock = { userId: string; name: string; reason: string };
type QuestionPage = { reports: QuestionReport[]; blocks: QuestionBlock[]; nextPage: number | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
function validPerson(value: unknown, name: "username" | "name"): value is Record<string, unknown> {
  return isRecord(value) && typeof value[name] === "string";
}
function validFeedReport(value: unknown): value is FeedReport {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && validId(value.id) &&
    (value.targetType === "post" || value.targetType === "comment") &&
    typeof value.status === "string" && typeof value.createdAt === "string" &&
    typeof value.reason === "string" && nullableString(value.snapshotText) &&
    nullableString(value.comment) && nullableString(value.resolution) &&
    nullableString(value.resolutionReason) &&
    (value.author === null ||
      (validPerson(value.author, "username") &&
        (value.author.feedPublishingBlocked === undefined ||
          typeof value.author.feedPublishingBlocked === "boolean"))) &&
    (value.reporter === null || validPerson(value.reporter, "username"));
}
function isFeedPage(source: unknown): source is FeedPage {
  if (!isRecord(source)) return false;
  return Number.isSafeInteger(source.pendingCount) &&
    (source.pendingCount as number) >= 0 &&
    (source.nextCursor === null ||
      (typeof source.nextCursor === "string" && validId(source.nextCursor))) &&
    Array.isArray(source.items) && source.items.every(validFeedReport);
}
function validQuestionReport(value: unknown): value is QuestionReport {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && validId(value.id) &&
    typeof value.questionTitle === "string" &&
    nullableString(value.answerId) && typeof value.createdAt === "string" &&
    typeof value.body === "string" && typeof value.reason === "string" &&
    nullableString(value.details) && validPerson(value.author, "name") &&
    validPerson(value.reporter, "name") && Array.isArray(value.photos) &&
    value.photos.every((photo: unknown) =>
      isRecord(photo) && typeof photo.id === "string" && typeof photo.url === "string");
}
function validQuestionBlock(value: unknown): value is QuestionBlock {
  return isRecord(value) && typeof value.userId === "string" && validId(value.userId) &&
    typeof value.name === "string" && typeof value.reason === "string";
}
function isQuestionPage(source: unknown): source is QuestionPage {
  if (!isRecord(source)) return false;
  return (source.nextPage === null ||
    (Number.isSafeInteger(source.nextPage) &&
      (source.nextPage as number) >= 1 && (source.nextPage as number) <= 10000)) &&
    Array.isArray(source.reports) && source.reports.every(validQuestionReport) &&
    Array.isArray(source.blocks) && source.blocks.every(validQuestionBlock);
}
const feedActions = {
  dismiss: "Отклонить жалобу",
  hide: "Скрыть у всех",
  delete: "Удалить из ленты",
  restore: "Восстановить контент",
  block: "Запретить публикации и комментарии",
  unblock: "Вернуть право публиковать",
} as const;
const questionActions = {
  dismiss: "Отклонить жалобу",
  hide: "Скрыть публикацию",
  delete: "Удалить публикацию",
  close: "Закрыть обсуждение",
  block: "Блокировать автора",
} as const;
function validId(id: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ru-RU") : value;
}
function FeedReportCard({
  report, afterSave,
}: { report: FeedReport; afterSave: () => Promise<boolean> }) {
  const [action, setAction] = useState<keyof typeof feedActions>("hide");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const writeLock = useRef(false);
  async function verify() {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true);
    try {
      if (await afterSave()) {
        setNeedsVerify(false);
        setError("");
      }
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (writeLock.current || needsVerify || !reason.trim() || !validId(report.id)) return;
    if (action !== "dismiss" && !window.confirm(`${feedActions[action]}?`)) return;
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      await requestAdmin(`/api/v1/admin/moderation/feed/reports/${report.id}`, {
        method: "POST",
        body: { action, reason: reason.trim() },
      });
      if (!(await afterSave())) {
        setNeedsVerify(true);
        setError("Решение отправлено, но повторная проверка не удалась. Перечитайте список.");
      }
    } catch (err) {
      const definiteRejection =
        err instanceof AdminHttpError && err.status >= 400 && err.status < 500;
      setNeedsVerify(!definiteRejection);
      setError(definiteRejection && err instanceof Error
        ? err.message
        : "Результат решения неизвестен. Проверьте состояние на сервере перед повтором.");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="moderation-report">
      <div className="report-title">
        <h3>
          {report.targetType === "post" ? "Публикация" : "Комментарий"} ·
          {report.author?.username ?? "Автор удалён"}
        </h3>
        <span className={`status-pill ${report.status === "pending" ? "active" : ""}`}>
          {report.status === "pending" ? "Новая" : "Рассмотрена"}
        </span>
        {report.author?.feedPublishingBlocked && (
          <span className="status-pill">Публикации запрещены</span>
        )}
      </div>
      <p className="note">
        Жалоба от {report.reporter?.username ?? "Пользователь удалён"} ·
        {formatDate(report.createdAt)}
      </p>
      <p>
        <strong>Причина жалобы:</strong>{" "}
        {FEED_REPORT_REASONS[report.reason as keyof typeof FEED_REPORT_REASONS] ?? report.reason}
      </p>
      {report.comment && <p>{report.comment}</p>}
      <blockquote className="report-text">
        <small>Текст на момент жалобы</small>
        <p>{report.snapshotText || "Публикация без текста"}</p>
      </blockquote>
      {report.resolution && (
        <p>
          Решение: {feedActions[report.resolution as keyof typeof feedActions] ?? report.resolution}
          . {report.resolutionReason}
        </p>
      )}
      <div className="moderation-controls">
        <label>
          Действие
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as keyof typeof feedActions)}
          >
            {Object.entries(feedActions).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Причина решения
          <textarea
            maxLength={1000}
            rows={2}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="note">При скрытии или удалении причина видна автору.</p>
        <button disabled={busy || needsVerify || !reason.trim()} onClick={() => void save()}>
          {busy ? "Сохраняем…" : "Применить решение"}
        </button>
        {needsVerify && (
          <button className="secondary" disabled={busy} onClick={() => void verify()}>
            Перечитать жалобу на сервере
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </article>
  );
}

export function FeedModerationPanel({ source }: { source: unknown; onSaved: () => void }) {
  const [data, setData] = useState(source);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(source);
    setCursors([null]);
  }, [source]);
  if (!isFeedPage(data)) return <p role="alert">Неверный формат жалоб Моментов</p>;
  const page = data;
  async function navigate(next: (string | null)[]) {
    const cursor = next[next.length - 1];
    if (cursor && !validId(cursor)) {
      setError("Некорректный курсор");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const result = await requestAdmin<unknown>(
        `/api/v1/admin/moderation/feed/reports${cursor ? `?cursor=${cursor}` : ""}`,
      );
      if (!isFeedPage(result)) throw new Error("Некорректный ответ списка жалоб");
      setData(result);
      setCursors(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка списка жалоб");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Модерация моментов · новых жалоб: {page.pendingCount}</h2>
      <p className="note">
        Проверьте сохранённый текст и выберите действие. Скрытый и удалённый модератором
        контент можно восстановить.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="secondary" disabled={busy} onClick={() => void navigate(cursors)}>
        Обновить список жалоб
      </button>
      {!page.items.length && <p className="empty">Жалоб пока нет</p>}
      {page.items.map((report) => (
        <FeedReportCard
          key={report.id}
          report={report}
          afterSave={() => navigate(cursors)}
        />
      ))}
      <div className="action-row">
        {cursors.length > 1 && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void navigate(cursors.slice(0, -1))}
          >
            Назад
          </button>
        )}
        {!!page.nextCursor && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void navigate([...cursors, page.nextCursor])}
          >
            Следующая страница
          </button>
        )}
      </div>
    </section>
  );
}

function QuestionReportCard({
  report,
  reason,
  busy,
  onModerate,
}: {
  report: QuestionReport;
  reason: string;
  busy: boolean;
  onModerate: (id: string, action: keyof typeof questionActions) => void;
}) {
  return (
    <article className="moderation-report">
      <h3>{report.questionTitle}</h3>
      <p className="note">
        {report.answerId ? "Ответ" : "Вопрос"} от {report.author.name} · Жалоба от{" "}
        {report.reporter.name} · {formatDate(report.createdAt)}
      </p>
      <blockquote className="report-text">{report.body}</blockquote>
      <div className="report-gallery">
        {report.photos.map((photo, index) => (
          <a href={photo.url} key={photo.id} target="_blank" rel="noopener noreferrer">
            <img src={photo.url} alt={`Фото публикации ${index + 1}`} loading="lazy" />
          </a>
        ))}
      </div>
      <p className="note">
        <strong>Жалоба:</strong> {report.reason}
        {report.details ? `: ${report.details}` : ""}
      </p>
      <div className="action-row">
        {Object.entries(questionActions).map(([action, label]) => (
          <button
            key={action}
            className="secondary"
            disabled={busy || !reason.trim()}
            onClick={() => onModerate(report.id, action as keyof typeof questionActions)}
          >
            {label}
          </button>
        ))}
      </div>
    </article>
  );
}
export function QuestionsModerationPanel({
  source,
}: {
  source: unknown;
  onSaved: () => void;
}) {
  const [data, setData] = useState(source);
  const [reason, setReason] = useState("Нарушение правил раздела");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const writeLock = useRef(false);
  useEffect(() => setData(source), [source]);
  if (!isQuestionPage(data)) return <p role="alert">Некорректный список модерации вопросов</p>;
  const page = data;
  async function refresh() {
    const first = await requestAdmin<unknown>("/api/v1/admin/moderation/questions/reports");
    if (!isQuestionPage(first)) throw new Error("Некорректный ответ модерации вопросов");
    setData(first);
  }
  async function run(action: () => Promise<unknown>) {
    if (writeLock.current || needsVerify || busy) return;
    writeLock.current = true;
    setBusy(true);
    setError("");
    let acknowledged = false;
    try {
      await action();
      acknowledged = true;
      await refresh();
      setNeedsVerify(false);
    } catch (err) {
      const definiteRejection = !acknowledged &&
        err instanceof AdminHttpError && err.status >= 400 && err.status < 500;
      setNeedsVerify(!definiteRejection);
      setError(definiteRejection && err instanceof Error
        ? err.message
        : "Результат изменения неизвестен. Перечитайте список перед повтором.");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true);
    try {
      await refresh();
      setNeedsVerify(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось перечитать данные");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  }
  function moderate(reportId: string, action: keyof typeof questionActions) {
    if (!validId(reportId) || !reason.trim()) return;
    if (action !== "dismiss" && !window.confirm(`${questionActions[action]}?`)) return;
    void run(() =>
      requestAdmin("/api/v1/admin/moderation/questions/reports", {
        method: "POST",
        body: { reportId, action, reason: reason.trim() },
      }),
    );
  }
  async function loadMore() {
    if (!page.nextPage || page.nextPage < 1 || page.nextPage > 10000) return;
    setBusy(true);
    setError("");
    try {
      const next = await requestAdmin<unknown>(
        `/api/v1/admin/moderation/questions/reports?page=${page.nextPage}`,
      );
      if (!isQuestionPage(next)) throw new Error("Некорректная следующая страница жалоб");
      const seen = new Set(page.reports.map((report) => report.id));
      setData({
        ...next,
        reports: [...page.reports, ...next.reports.filter((report) => !seen.has(report.id))],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить жалобы");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Вопросы: модерация</h2>
      <p className="note">Блокировка запрещает публикации только в разделе «Вопросы».</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {needsVerify && (
        <button className="secondary" disabled={busy} onClick={() => void verify()}>
          Перечитать модерацию на сервере
        </button>
      )}
      <label>
        Причина решения / блокировки
        <textarea
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {!page.reports.length && <p className="empty">Новых жалоб нет</p>}
      {page.reports.map((report) => (
        <QuestionReportCard
          key={report.id}
          report={report}
          reason={reason}
          busy={busy || needsVerify}
          onModerate={moderate}
        />
      ))}
      {!!page.nextPage && (
        <button className="secondary" disabled={busy || needsVerify} onClick={() => void loadMore()}>
          Ещё жалобы
        </button>
      )}
      <h2>Блокировки в вопросах</h2>
      {!page.blocks.length && <p className="empty">Блокировок нет</p>}
      {page.blocks.map((block) => (
        <div className="exception-row" key={block.userId}>
          <div>
            <strong>{block.name}</strong>
            <p>{block.reason}</p>
          </div>
          <button
            className="secondary"
            disabled={busy || needsVerify}
            onClick={() => {
              if (!validId(block.userId)) return;
              void run(() =>
                requestAdmin(`/api/v1/admin/moderation/questions/blocks/${block.userId}`, {
                  method: "DELETE",
                }),
              );
            }}
          >
            Снять блокировку
          </button>
        </div>
      ))}
    </section>
  );
}

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";

const daySchema = z.object({
  date: z.string(), bundleTitle: z.string(), description: z.string(),
  isEmpty: z.boolean(), isPast: z.boolean(), canImport: z.boolean(),
  errors: z.array(z.string()),
  conflict: z.object({ scheduleId: z.string(), bundleTitle: z.string(),
    isPublished: z.boolean() }).nullable(),
  steps: z.array(z.object({ order: z.number(), title: z.string(), type: z.string(),
    errors: z.array(z.string()) }).passthrough()),
}).passthrough();
const previewSchema = z.object({
  days: z.array(daySchema), hasErrors: z.boolean(), summary: z.object({
    totalDays: z.number(), emptyDays: z.number(), importableDays: z.number(),
    conflictDays: z.number(), errorDays: z.number(),
  }),
}).strict();
const previewEnvelope = z.object({ success: z.literal(true), data: z.object({
  preview: previewSchema, previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
}) });
const confirmEnvelope = z.object({ success: z.literal(true), data: z.object({
  importedDates: z.array(z.string()),
  skippedDates: z.array(z.object({ date: z.string(), reason: z.string() })),
}) });
type Preview = z.infer<typeof previewSchema>;
type Session = { actor: PanelActor; token: string | null; authEpoch?: string } | null;
export type DailyImportTransport = (request: {
  method: "POST"; path: string; body: unknown; signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
const MAX_FILE = 1_048_576;
const safeCache = (headers: Record<string, string>) => {
  const parts = (headers["cache-control"] ?? "").toLowerCase().split(",").map(x => x.trim());
  return parts.includes("private") && parts.includes("no-store") && !parts.includes("public");
};
const status = (day: Preview["days"][number]) => day.isEmpty ? "Пустой день" :
  day.errors.length || day.steps.some(x => x.errors.length) ? "Ошибка файла" :
  day.isPast ? "Прошедшая дата" : day.conflict ? "Уже назначено — пропуск" :
  day.canImport ? "Готово" : "Пропуск";

export function TrainerDailyImportRoute(p: {
  pathname: string; actor: PanelActor; token: string | null; authEpoch?: string;
  enabled?: boolean; dailyImportTransport?: DailyImportTransport;
  getCurrentSession?: () => Session;
}) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [digest, setDigest] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [phase, setPhase] = useState<"idle" | "preview" | "confirm" | "success" | "uncertain">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{importedDates: string[];
    skippedDates: {date: string; reason: string}[]} | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = phase === "preview" || phase === "confirm";
  const allowed = p.enabled === true && p.pathname === "/main-panel/daily-course/import" &&
    !!p.dailyImportTransport && !!p.token && !!p.authEpoch &&
    (p.actor.role === "TRAINER" || p.actor.role === "ADMIN");
  const live = () => {
    const s = p.getCurrentSession ? p.getCurrentSession() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!s && !!p.token && s.token === p.token && s.authEpoch === p.authEpoch &&
      s.actor.id === p.actor.id && s.actor.role === p.actor.role;
  };
  useEffect(() => () => { request.current?.abort(); generation.current++; },
    [p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const invalidate = (value: string, name: string) => {
    request.current?.abort(); setContent(value); setFileName(name);
    setPreview(null); setDigest(""); setConfirmation(""); setResult(null);
    setPhase("idle"); setMessage("");
  };
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++generation.current;
    if (!/\.(md|txt)$/i.test(file.name) || file.size > MAX_FILE) {
      invalidate("", ""); setMessage("Выберите .md или .txt размером до 1 МБ."); return;
    }
    try {
      const value = await file.text();
      if (id === generation.current && live()) invalidate(value, file.name);
    } catch {
      if (id === generation.current) setMessage("Не удалось прочитать файл.");
    }
  }
  async function showPreview() {
    if (!allowed || !live() || busy || !content.trim() || content.length > MAX_FILE) return;
    const controller = new AbortController(); request.current = controller;
    setPhase("preview"); setMessage(""); setPreview(null); setResult(null);
    try {
      const response = await p.dailyImportTransport!({
        method: "POST", path: "/api/v1/trainer/daily-course/import/preview",
        body: { content }, signal: controller.signal,
      });
      if (controller.signal.aborted || !live()) return;
      if (response.status !== 200 || !safeCache(response.headers))
        throw Error("INVALID_PREVIEW_RESPONSE");
      const data = previewEnvelope.parse(response.body).data;
      setPreview(data.preview); setDigest(data.previewDigest); setConfirmation("");
      setPhase("idle");
    } catch {
      if (!controller.signal.aborted && live()) {
        setPhase("idle"); setMessage("Не удалось проверить файл. Проверьте формат и повторите.");
      }
    } finally { if (request.current === controller) request.current = null; }
  }
  async function confirmImport() {
    if (!allowed || !live() || busy || phase === "success" ||
        !preview || !digest || preview.summary.importableDays < 1 ||
        confirmation !== "ИМПОРТИРОВАТЬ") return;
    const controller = new AbortController(); request.current = controller;
    setPhase("confirm"); setMessage("");
    try {
      const response = await p.dailyImportTransport!({
        method: "POST", path: "/api/v1/trainer/daily-course/import/confirm",
        body: { content, previewDigest: digest, confirmation }, signal: controller.signal,
      });
      if (controller.signal.aborted || !live()) return;
      if (!safeCache(response.headers)) throw Error("UNSAFE_IMPORT_RESPONSE");
      if (response.status === 409 && response.body && typeof response.body === "object" &&
          "code" in response.body && response.body.code === "PREVIEW_CHANGED") {
        setPhase("idle"); setPreview(null); setDigest(""); setConfirmation("");
        setMessage("Расписание изменилось после предпросмотра. Проверьте файл повторно.");
        return;
      }
      if (response.status !== 200) throw Error("IMPORT_UNCONFIRMED");
      setResult(confirmEnvelope.parse(response.body).data); setPhase("success");
    } catch {
      if (!controller.signal.aborted && live()) {
        // Network failure could occur after a committed import. Never automatically retry.
        setPhase("uncertain");
        setMessage("Результат импорта неизвестен. Проверьте календарь перед повтором.");
      }
    } finally { if (request.current === controller) request.current = null; }
  }
  if (!allowed || !live()) return <main role="alert">Импорт курса дня недоступен.</main>;
  return <main className="trainer-workspace trainer-daily-import" data-trainer-daily-import="hono">
    <h1>Импорт курса дня из файла</h1>
    <p className="trainer-workspace-subtitle">Загрузите .md или .txt, проверьте даты,
      связки и шаги, затем подтвердите добавление.</p>
    <nav className="trainer-workspace-tabs" aria-label="Курс дня">
      <a href="/daily-course">Календарь</a>
      <a href="/daily-course/bundles">Связки</a>
      <a href="/daily-course/import" aria-current="page">Импорт из файла</a>
    </nav>
    <section className="trainer-workspace-panel">
      <h2>1. Выберите файл</h2>
      <label className="trainer-import-file">Загрузить файл .md / .txt (до 1 МБ)
        <input type="file" accept=".md,.txt,text/markdown,text/plain"
          disabled={busy || phase === "success"} onChange={event => void chooseFile(event)} />
      </label>
      {fileName && <p className="trainer-workspace-count">Файл: {fileName}</p>}
      <label className="trainer-import-text">Или вставьте содержимое файла вручную
        <textarea rows={9} value={content} disabled={busy || phase === "success"}
          placeholder="## 2026-11-05\nBundle title: ..."
          onChange={event => { generation.current++; invalidate(event.target.value, ""); }} />
      </label>
      <button type="button" className="trainer-import-action"
        disabled={busy || phase === "success" || !content.trim() || content.length > MAX_FILE}
        onClick={() => void showPreview()}>
        {phase === "preview" ? "Проверяем файл…" : "Показать предпросмотр"}
      </button>
    </section>
    {preview && <section className="trainer-workspace-panel">
      <h2>2. Предпросмотр</h2>
      <div className="trainer-workspace-kpis">
        <div><span>Дней в файле</span><strong>{preview.summary.totalDays}</strong></div>
        <div><span>Будет добавлено</span><strong>{preview.summary.importableDays}</strong></div>
        <div><span>Занятые даты</span><strong>{preview.summary.conflictDays}</strong></div>
        <div><span>С ошибками</span><strong>{preview.summary.errorDays}</strong></div>
      </div>
      {preview.summary.conflictDays > 0 && <p role="note" className="trainer-import-warning">
        Занятые даты пропускаются. Существующие назначения и прогресс учеников
        не перезаписываются. Безопасная замена конфликтов пока недоступна.
      </p>}
      <div className="trainer-workspace-table-scroll"><table>
        <thead><tr><th>Дата</th><th>Статус</th><th>Связка и описание</th>
          <th>Шаги</th><th>Ошибки</th></tr></thead>
        <tbody>{preview.days.map((day, index) => <tr key={`${day.date}-${index}`}>
          <td><time dateTime={day.date}>{day.date}</time></td>
          <td><span className={"trainer-workspace-status " +
            (day.canImport ? "is-done" : "is-pending")}>{status(day)}</span></td>
          <td><strong>{day.bundleTitle || "—"}</strong>
            {day.description && <small>{day.description}</small>}
            {day.conflict && <small>Сейчас назначено: {day.conflict.bundleTitle}</small>}
          </td>
          <td>{day.steps.length ? <details><summary>{day.steps.length} шагов</summary>
            <ol>{day.steps.map(step => <li key={step.order}>
              {step.order}. {step.title} · {step.type}</li>)}</ol>
          </details> : "—"}</td>
          <td>{[...day.errors, ...day.steps.flatMap(step => step.errors.map(error =>
            `Шаг ${step.order}: ${error}`))].join("; ") || "—"}</td>
        </tr>)}</tbody>
      </table></div>
      {preview.summary.importableDays > 0 && phase !== "success" && phase !== "uncertain" &&
        <div className="trainer-import-confirm">
          <h3>3. Подтвердите импорт</h3>
          <p>Будет добавлено {preview.summary.importableDays} новых дат.
            Все шаги и связки создаются под вашей учётной записью.</p>
          <label>Введите «ИМПОРТИРОВАТЬ»
            <input type="text" value={confirmation} disabled={busy}
              onChange={event => setConfirmation(event.target.value)} />
          </label>
          <button className="trainer-import-action" type="button"
            disabled={busy || confirmation !== "ИМПОРТИРОВАТЬ"}
            onClick={() => void confirmImport()}>
            {phase === "confirm" ? "Импортируем…" :
              `Импортировать ${preview.summary.importableDays} дат`}
          </button>
        </div>}
      {preview.summary.importableDays === 0 && <p role="status">
        Новых подходящих дат нет. Проверьте ошибки и занятые даты.</p>}
    </section>}
    {result && <section className="trainer-workspace-panel" role="status">
      <h2>Импорт завершён</h2>
      <p>Добавлено дат: <strong>{result.importedDates.length}</strong>.
        Пропущено: {result.skippedDates.length}.</p>
      {result.importedDates.length > 0 && <details>
        <summary>Добавленные дни ({result.importedDates.length})</summary>
        <ul>{result.importedDates.map(date => <li key={date}>{date}</li>)}</ul>
      </details>}
      {result.skippedDates.length > 0 && <details>
        <summary>Пропущенные дни ({result.skippedDates.length})</summary>
        <ul>{result.skippedDates.map((item, index) => <li key={`${item.date}-${index}`}>
          {item.date}: {{ CONFLICT: "уже назначено", PAST_DATE: "прошедшая дата",
            ERRORS: "ошибка в файле" }[item.reason] ?? item.reason}
        </li>)}</ul>
      </details>}
      <p><a href="/daily-course">Вернуться в календарь</a> ·
        <a href="/daily-course/bundles"> Посмотреть связки</a></p>
    </section>}
    {message && <p role={phase === "uncertain" ? "alert" : "status"}
      className="trainer-import-warning">{message}</p>}
  </main>;
}

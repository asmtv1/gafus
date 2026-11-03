import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod/v3";
import { matchesCatalogSearch } from "./live/trainerCatalogSearch";
import type { PanelActor } from "./consultationContract";
import type { ExamSummaryTransport } from "./TrainerExamSummaryRead20261022";

const examSchema = z
  .object({
    id: z.string(),
    userStepId: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
    reviewedAt: z.string().datetime().nullable(),
    courseName: z.string(),
    courseType: z.string(),
    stepTitle: z.string(),
    hasTestQuestions: z.boolean(),
    requiresWrittenFeedback: z.boolean(),
    requiresVideoReport: z.boolean(),
    userName: z.string(),
    testScore: z.number().nullable(),
    testMaxScore: z.number().nullable(),
    testAnswers: z.unknown(),
    writtenFeedback: z.string().nullable(),
    videoReportUrl: z.string().nullable(),
    trainerComment: z.string().nullable(),
    overallScore: z.number().nullable(),
    isPassed: z.boolean().nullable(),
    reviewedBy: z.string().nullable(),
  })
  .strict();
const resultSchema = z.object({ success: z.literal(true), data: z.array(examSchema) }).strict();
type Exam = z.infer<typeof examSchema>;
const cacheSafe = (headers: Record<string, string>) => {
  const parts = (headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  return parts.includes("private") && parts.includes("no-store") && !parts.includes("public");
};
const safeVideoUrl = (url: string | null) => {
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
};
export type TrainerExamManageTransport = (input: {
  method: "POST";
  path: string;
  body: unknown;
  signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export function TrainerExamManageRoute(p: {
  pathname: string;
  search?: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enabled?: boolean;
  examSummaryTransport?: ExamSummaryTransport;
  examManageTransport?: TrainerExamManageTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [view, setView] = useState<{
    phase: "loading" | "ready" | "error" | "denied";
    rows: Exam[];
  }>({ phase: "loading", rows: [] });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [hideCompleted, setHideCompleted] = useState(
    () => new URLSearchParams(p.search ?? "").get("hideCompleted") !== "false",
  );
  const [type, setType] = useState<"all" | "test" | "written" | "video">("all");
  const [sort, setSort] = useState<"date" | "course" | "user">("date");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const sequenceRef = useRef(0);
  const activeSessionRef = useRef(p.getCurrentSession);
  activeSessionRef.current = p.getCurrentSession;
  const identity = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const current = useCallback(() => {
    const session = activeSessionRef.current?.();
    return (
      !!session &&
      session.actor.id === p.actor.id &&
      session.actor.role === p.actor.role &&
      session.token === p.token &&
      session.authEpoch === p.authEpoch
    );
  }, [p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const allowed =
    p.pathname === "/main-panel/exam-results" &&
    !!p.enabled &&
    !!p.token &&
    !!p.authEpoch &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role) &&
    !!p.examSummaryTransport &&
    !!p.examManageTransport &&
    current();
  useEffect(() => {
    const sequence = sequenceRef;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sequence.current++;
      requestRef.current?.abort();
    };
  }, [identity]);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const controller = new AbortController();
    const sequence = ++sequenceRef.current;
    setView({ phase: "loading", rows: [] });
    void p.examSummaryTransport!("/api/v1/trainer/exam-results/manage", controller.signal)
      .then((response) => {
        if (!live || controller.signal.aborted || sequence !== sequenceRef.current || !current())
          return;
        if (response.status === 401 || response.status === 403) {
          setView({ phase: "denied", rows: [] });
          return;
        }
        if (response.status !== 200 || !cacheSafe(response.headers))
          throw Error("UNSAFE_EXAM_RESPONSE");
        const data = resultSchema.parse(response.body).data;
        setView({ phase: "ready", rows: data });
      })
      .catch(() => {
        if (live && !controller.signal.aborted && sequence === sequenceRef.current && current())
          setView({ phase: "error", rows: [] });
      });
    const generation = sequenceRef;
    return () => {
      live = false;
      controller.abort();
      generation.current++;
    };
  }, [identity, allowed, current, p.examSummaryTransport, refresh]);
  async function review(exam: Exam, action: "approve" | "reject") {
    if (
      !allowed ||
      !current() ||
      busyRef.current ||
      view.phase !== "ready" ||
      exam.status !== "IN_PROGRESS" ||
      (exam.hasTestQuestions && !exam.requiresWrittenFeedback && !exam.requiresVideoReport)
    )
      return;
    const word = action === "approve" ? "Принять" : "Отклонить";
    if (!window.confirm(word + " экзамен «" + exam.stepTitle + "»?")) return;
    busyRef.current = true;
    setSaving(exam.id);
    setMessage("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await p.examManageTransport!({
        method: "POST",
        path: "/api/v1/trainer/exam-results/manage/review",
        body: {
          userStepId: exam.userStepId,
          action,
          trainerComment: comments[exam.id]?.trim() || null,
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status === 401 || response.status === 403) {
        setView({ phase: "denied", rows: [] });
        return;
      }
      if (
        response.status !== 200 ||
        !cacheSafe(response.headers) ||
        !response.body ||
        typeof response.body !== "object" ||
        !("success" in response.body) ||
        response.body.success !== true
      )
        throw Error("REVIEW_NOT_CONFIRMED");
      // Never say "reviewed" on a 200 alone; verify Core's updated state.
      const readback = await p.examSummaryTransport!(
        "/api/v1/trainer/exam-results/manage",
        controller.signal,
      );
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (readback.status !== 200 || !cacheSafe(readback.headers)) throw Error("READBACK_FAILED");
      const rows = resultSchema.parse(readback.body).data;
      const updated = rows.find((row) => row.id === exam.id && row.userStepId === exam.userStepId);
      if (
        !updated ||
        updated.reviewedAt === null ||
        updated.isPassed !== (action === "approve") ||
        updated.status !== (action === "approve" ? "COMPLETED" : "IN_PROGRESS")
      )
        throw Error("READBACK_MISMATCH");
      setView({ phase: "ready", rows });
      setMessage("Решение подтверждено обновлёнными данными сервера.");
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current()) {
        setMessage("Решение не подтверждено. Обновите результаты перед повторной проверкой.");
        setRefresh((x) => x + 1);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setSaving(null);
    }
  }
  if (!allowed)
    return (
      <main>
        <p role="alert">Экзамены недоступны</p>
      </main>
    );
  if (view.phase === "loading") return <main role="status">Загрузка результатов экзаменов…</main>;
  if (view.phase === "denied") return <main role="alert">Нет доступа к результатам экзаменов</main>;
  if (view.phase === "error")
    return (
      <main>
        <p role="alert">Не удалось загрузить экзамены</p>
        <button type="button" onClick={() => setRefresh((x) => x + 1)}>
          Повторить
        </button>
      </main>
    );
  const filtered = view.rows
    .filter(
      (row) =>
        (!hideCompleted || row.status === "IN_PROGRESS") &&
        (type === "all" ||
          (type === "test" && row.hasTestQuestions) ||
          (type === "written" && row.requiresWrittenFeedback) ||
          (type === "video" && row.requiresVideoReport)) &&
        matchesCatalogSearch(query, [row.userName, row.courseName, row.stepTitle, row.id]),
    )
    .sort((a, b) =>
      sort === "course" ? a.courseName.localeCompare(b.courseName, "ru") :
        sort === "user" ? a.userName.localeCompare(b.userName, "ru") :
          b.createdAt.localeCompare(a.createdAt),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 15));
  const activePage = Math.min(page, pages - 1);
  const shown = filtered.slice(activePage * 15, (activePage + 1) * 15);
  return (
    <main className="trainer-workspace trainer-workspace-exams">
      <h1>Результаты экзаменов</h1>
      <p className="trainer-workspace-subtitle">Проверка отчётов, обратная связь и история решений</p>
      <nav className="trainer-workspace-tabs" aria-label="Разделы результатов экзаменов">
        <a aria-current={hideCompleted ? "page" : undefined}
          href="/exam-results?hideCompleted=true">На проверке</a>
        <a aria-current={!hideCompleted ? "page" : undefined}
          href="/exam-results?hideCompleted=false">Все экзамены</a>
      </nav>
      <div className="trainer-workspace-kpis trainer-workspace-kpis-small">
        <div><span>Всего результатов</span><strong>{view.rows.length}</strong></div>
        <div><span>На проверке</span><strong>{view.rows.filter(row =>
          row.status === "IN_PROGRESS").length}</strong></div>
        <div><span>Завершено</span><strong>{view.rows.filter(row =>
          row.status === "COMPLETED").length}</strong></div>
      </div>
      <section className="trainer-workspace-panel">
      <div className="trainer-workspace-filters">
        <label className="trainer-workspace-search">Поиск экзамена
          <input type="search" value={query} placeholder="Ученик, курс, шаг или ID…"
            onChange={e => { setQuery(e.target.value); setPage(0); }} />
        </label>
      <p>
        Всего результатов: {view.rows.length}. Показано: {filtered.length}.
      </p>
      <label>
        <input
          type="checkbox"
          checked={hideCompleted}
          onChange={(e) => { setHideCompleted(e.target.checked); setPage(0); }}
        />
        Скрывать завершённые
      </label>
      <label>
        Тип
        <select value={type} onChange={(e) => {
          setType(e.target.value as typeof type); setPage(0);
        }}>
          <option value="all">Все</option>
          <option value="test">Тесты</option>
          <option value="written">Письменные</option>
          <option value="video">Видео</option>
        </select>
      </label>
      <label>
        Сортировка
        <select value={sort} onChange={(e) => {
          setSort(e.target.value as typeof sort); setPage(0);
        }}>
          <option value="date">По дате</option>
          <option value="course">По курсу</option>
          <option value="user">По ученику</option>
        </select>
      </label>
      </div>
      <button type="button" className="trainer-workspace-secondary"
        disabled={!!saving} onClick={() => setRefresh((x) => x + 1)}>
        Обновить результаты
      </button>
      {query && <button type="button" className="trainer-workspace-clear"
        onClick={() => { setQuery(""); setPage(0); }}>Очистить поиск</button>}
      {!filtered.length && <p role="status" className="trainer-workspace-empty">
        Экзаменов по выбранным фильтрам нет</p>}
      <ul className="trainer-workspace-record-list" aria-label="Результаты экзаменов">
        {shown.map((row) => {
          const autoTest =
            row.hasTestQuestions && !row.requiresWrittenFeedback && !row.requiresVideoReport;
          const video = safeVideoUrl(row.videoReportUrl);
          return (
            <li key={row.id} className="trainer-workspace-record">
              <details>
                <summary>
                  <strong>{row.stepTitle}</strong> — {row.userName}({row.courseName}) —{" "}
                  <span className={"trainer-workspace-status " +
                    (row.status === "COMPLETED" ? "is-done" : "is-pending")}>
                    {row.status === "COMPLETED" ? "Завершён" : "На проверке"}
                  </span>
                </summary>
                <p>Отправлено: {new Date(row.createdAt).toLocaleString("ru-RU")}</p>
                {row.testScore !== null && (
                  <p>
                    Тест: {row.testScore}/{row.testMaxScore ?? "?"}
                  </p>
                )}
                {row.testAnswers != null && <pre>{JSON.stringify(row.testAnswers, null, 2)}</pre>}
                {row.writtenFeedback && (
                  <section>
                    <h3>Письменный отчёт</h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>{row.writtenFeedback}</p>
                  </section>
                )}
                {video && (
                  <video
                    controls
                    preload="metadata"
                    playsInline
                    src={video}
                    style={{ width: "min(100%, 540px)" }}
                  />
                )}
                {row.requiresVideoReport && !video && <p>Видеоотчёт недоступен</p>}
                {row.reviewedAt && (
                  <p>
                    Проверено: {new Date(row.reviewedAt).toLocaleString("ru-RU")}
                    {row.reviewedBy ? " · " + row.reviewedBy : ""}
                  </p>
                )}
                {row.trainerComment && <p>Комментарий: {row.trainerComment}</p>}
                {!autoTest && row.status === "IN_PROGRESS" && (
                  <div>
                    <label>
                      Комментарий тренера
                      <textarea
                        maxLength={1000}
                        value={comments[row.id] ?? row.trainerComment ?? ""}
                        disabled={saving !== null}
                        onChange={(e) =>
                          setComments((old) => ({ ...old, [row.id]: e.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={saving !== null}
                      onClick={() => void review(row, "approve")}
                    >
                      Принять экзамен
                    </button>
                    <button
                      type="button"
                      disabled={saving !== null}
                      onClick={() => void review(row, "reject")}
                    >
                      Вернуть на доработку
                    </button>
                  </div>
                )}
                {autoTest && <p>Тест проверяется автоматически</p>}
              </details>
            </li>
          );
        })}
      </ul>
      {filtered.length > 15 && <footer className="trainer-workspace-pages">
        <span>Страница {activePage + 1} из {pages}</span>
        <button type="button" disabled={activePage === 0}
          onClick={() => setPage(activePage - 1)}>Назад</button>
        <button type="button" disabled={activePage + 1 >= pages}
          onClick={() => setPage(activePage + 1)}>Далее</button>
      </footer>}
      {message && <p role="status">{message}</p>}
      </section>
    </main>
  );
}

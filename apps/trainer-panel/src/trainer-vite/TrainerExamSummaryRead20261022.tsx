import { createElement, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
const summary = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().datetime(),
    courseName: z.string(),
    stepTitle: z.string(),
    status: z.enum(["IN_PROGRESS", "COMPLETED"]),
    hasTestQuestions: z.boolean(),
    requiresWrittenFeedback: z.boolean(),
    requiresVideoReport: z.boolean(),
  })
  .strict();
import type { TrainerExamSummaryItem, TrainerPendingExamSummaryItem } from "@gafus/types";
export type TrainerExamSummary = TrainerExamSummaryItem;
const pendingSchema = z
  .object({
    id: z.string().min(1),
    stepTitle: z.string(),
    courseName: z.string(),
    dayTitle: z.string(),
    hasTestQuestions: z.boolean(),
    hasWrittenFeedback: z.boolean(),
    hasVideoReport: z.boolean(),
    submittedAt: z.string().datetime(),
  })
  .strict();
type PendingSummary = TrainerPendingExamSummaryItem;
const PENDING_PATH = "/api/v1/trainer/exam-results/pending-summary";
/** Legacy Next defaults to hiding completed when the URL does not specify a value. */
export function examHideCompletedFromSearch(search?: string): boolean {
  const value = new URLSearchParams(search ?? "").get("hideCompleted");
  return value === null ? true : value === "true";
}
export type ExamSummaryTransport = (
  path: string,
  signal: AbortSignal,
) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
/** AG1 continuation137 registered read-only summary GET, strict eight-field DTO. */
export const EXAM_SUMMARY_PATH = "/api/v1/trainer/exam-results/summary";
export function TrainerExamSummaryRead20261022(p: {
  pathname: string;
  search?: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enabled?: boolean;
  transport?: ExamSummaryTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [tab, setTab] = useState<"summary" | "pending">("summary");
  const [pending, setPending] = useState<{
    scope: string;
    phase: "loading" | "ready" | "error" | "denied";
    rows: PendingSummary[];
  }>({ scope: "", phase: "loading", rows: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [pendingRetry, setPendingRetry] = useState(0);
  const [hideCompleted, setHideCompleted] = useState(() => examHideCompletedFromSearch(p.search));
  useEffect(() => setHideCompleted(examHideCompletedFromSearch(p.search)), [p.search]);
  const [kind, setKind] = useState<"all" | "test" | "written" | "video">("all");
  const [sort, setSort] = useState<"date" | "course">("date");
  const [data, setData] = useState<{
    scope: string;
    phase: "loading" | "ready" | "error" | "denied";
    rows: TrainerExamSummary[];
  }>({ scope: "", phase: "loading", rows: [] });
  const scope = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const actorId = p.actor.id;
  const actorRole = p.actor.role;
  const token = p.token;
  const authEpoch = p.authEpoch;
  const getCurrentSession = p.getCurrentSession;
  const current = useCallback(() => {
    const s = getCurrentSession
      ? getCurrentSession()
      : { actor: { id: actorId, role: actorRole }, token, authEpoch };
    return (
      !!s &&
      s.actor.id === actorId &&
      s.actor.role === actorRole &&
      s.token === token &&
      s.authEpoch === authEpoch
    );
  }, [actorId, actorRole, token, authEpoch, getCurrentSession]);
  const allowed =
    p.pathname === "/main-panel/exam-results" &&
    p.enabled === true &&
    !!p.transport &&
    !!p.token &&
    !!p.authEpoch &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role) &&
    current();
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setData({ scope, phase: "loading", rows: [] });
    if (allowed && actorRole !== "MODERATOR")
      void (async () => {
        const response = await p.transport!(EXAM_SUMMARY_PATH, controller.signal);
        if (!live || controller.signal.aborted || !current()) return;
        const cache = (response.headers["cache-control"] ?? "").toLowerCase();
        if (response.status === 403) throw Error("TERMINAL_403");
        if (response.status !== 200 || !cache.includes("private") || !cache.includes("no-store"))
          throw Error("READ_DENIED");
        const rows = z
          .object({ success: z.literal(true), data: z.array(summary) })
          .strict()
          .parse(response.body).data;
        if (live && current()) setData({ scope, phase: "ready", rows });
      })().catch((error: unknown) => {
        if (live && current())
          setData({
            scope,
            phase: error instanceof Error && error.message === "TERMINAL_403" ? "denied" : "error",
            rows: [],
          });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [scope, allowed, summaryRetry, p.transport, current, actorRole]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setPending({ scope, phase: "loading", rows: [] });
    if (allowed && (tab === "pending" || actorRole === "MODERATOR"))
      void (async () => {
        const response = await p.transport!(PENDING_PATH, controller.signal);
        if (!live || controller.signal.aborted || !current()) return;
        const cache = (response.headers["cache-control"] ?? "").toLowerCase();
        if (response.status === 403) throw Error("TERMINAL_403");
        if (response.status !== 200 || !cache.includes("private") || !cache.includes("no-store"))
          throw Error("READ_DENIED");
        const rows = z
          .object({ success: z.literal(true), data: z.array(pendingSchema) })
          .strict()
          .parse(response.body).data;
        if (live && current()) setPending({ scope, phase: "ready", rows });
      })().catch((error: unknown) => {
        if (live && current())
          setPending({
            scope,
            phase: error instanceof Error && error.message === "TERMINAL_403" ? "denied" : "error",
            rows: [],
          });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [scope, allowed, tab, pendingRetry, p.transport, current, actorRole]);
  if (!allowed)
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Результаты экзаменов недоступны"),
    );
  const tabs = createElement(
    "nav",
    { "aria-label": "Разделы результатов экзаменов" },
    p.actor.role !== "MODERATOR"
      ? createElement(
          "button",
          { type: "button", onClick: () => setTab("summary") },
          "Все результаты",
        )
      : null,
    createElement(
      "button",
      { type: "button", onClick: () => setTab("pending") },
      "Ожидают проверки",
    ),
  );
  if (tab === "pending" || p.actor.role === "MODERATOR") {
    const v = pending.scope === scope ? pending : { phase: "loading" as const, rows: [] };
    if (v.phase === "loading")
      return createElement(
        "main",
        null,
        tabs,
        createElement("p", { role: "status" }, "Загрузка ожидающих экзаменов"),
      );
    if (v.phase === "denied")
      return createElement(
        "main",
        null,
        tabs,
        createElement("p", { role: "alert" }, "Нет доступа к ожидающим экзаменам"),
        createElement("a", { href: "/main-panel" }, "Назад в панель тренера"),
      );
    if (v.phase === "error")
      return createElement(
        "main",
        null,
        tabs,
        createElement("p", { role: "alert" }, "Не удалось получить ожидающие экзамены"),
        createElement(
          "button",
          { type: "button", onClick: () => setPendingRetry((x) => x + 1) },
          "Повторить чтение",
        ),
      );
    return createElement(
      "main",
      { "data-exam-pending-readonly": "true" },
      createElement("h1", null, "Ожидают проверки"),
      tabs,
      createElement("p", null, `Всего ожидающих: ${v.rows.length}`),
      v.rows.length === 0
        ? createElement("p", { role: "status" }, "Ожидающих экзаменов нет")
        : createElement(
            "ul",
            null,
            ...v.rows.map((x) =>
              createElement(
                "li",
                { key: x.id },
                x.courseName,
                " — ",
                x.dayTitle,
                " — ",
                x.stepTitle,
                " — ",
                x.submittedAt.slice(0, 10),
              ),
            ),
          ),
    );
  }
  const view = data.scope === scope ? data : { phase: "loading" as const, rows: [] };
  if (view.phase === "loading")
    return createElement(
      "main",
      null,
      tabs,
      createElement("p", { role: "status" }, "Загрузка результатов экзаменов"),
    );
  if (view.phase === "denied")
    return createElement(
      "main",
      null,
      tabs,
      createElement("p", { role: "alert" }, "Нет доступа к результатам экзаменов"),
      createElement("a", { href: "/main-panel" }, "Назад в панель тренера"),
    );
  if (view.phase === "error")
    return createElement(
      "main",
      null,
      tabs,
      createElement("p", { role: "alert" }, "Не удалось получить результаты экзаменов"),
      createElement(
        "button",
        { type: "button", onClick: () => setSummaryRetry((x) => x + 1) },
        "Повторить чтение",
      ),
    );
  const filtered = view.rows
    .filter(
      (row) =>
        (!hideCompleted || row.status === "IN_PROGRESS") &&
        (kind === "all" ||
          (kind === "test" && row.hasTestQuestions) ||
          (kind === "written" && row.requiresWrittenFeedback) ||
          (kind === "video" && row.requiresVideoReport)),
    )
    .sort((a, b) =>
      sort === "date"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.courseName.localeCompare(b.courseName, "ru") ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
    );
  const selectedRow = filtered.find((row) => row.id === selected);
  return createElement(
    "main",
    { "data-exam-readonly": "true" },
    createElement("h1", null, "Результаты экзаменов"),
    tabs,
    createElement(
      "p",
      null,
      p.actor.role === "ADMIN" ? "Результаты доступных курсов" : "Результаты по вашим курсам",
    ),
    createElement(
      "p",
      null,
      `Всего: ${view.rows.length}; ожидают: ${view.rows.filter((x) => x.status === "IN_PROGRESS").length}; зачтены: ${view.rows.filter((x) => x.status === "COMPLETED").length}; отображено: ${filtered.length}`,
    ),
    createElement(
      "label",
      null,
      createElement("input", {
        type: "checkbox",
        checked: hideCompleted,
        onChange: (e) => setHideCompleted(e.target.checked),
      }),
      "Скрыть зачтённые",
    ),
    createElement(
      "label",
      null,
      "Тип отчёта",
      createElement(
        "select",
        {
          value: kind,
          onChange: (e) => setKind((e.currentTarget as HTMLSelectElement).value as typeof kind),
        },
        ...(["all", "test", "written", "video"] as const).map((x) =>
          createElement(
            "option",
            { key: x, value: x },
            ({ all: "Все", test: "Тест", written: "Письменный", video: "Видео" } as const)[x],
          ),
        ),
      ),
    ),
    createElement(
      "label",
      null,
      "Сортировка",
      createElement(
        "select",
        {
          value: sort,
          onChange: (e) => setSort((e.currentTarget as HTMLSelectElement).value as typeof sort),
        },
        createElement("option", { value: "date" }, "По дате"),
        createElement("option", { value: "course" }, "По курсу"),
      ),
    ),
    filtered.length === 0
      ? createElement(
          "p",
          { role: "status" },
          view.rows.length === 0 ? "Результатов нет" : "Нет результатов по выбранным фильтрам",
        )
      : createElement(
          "ul",
          null,
          ...filtered.map((row) =>
            createElement(
              "li",
              { key: row.id },
              createElement(
                "button",
                { type: "button", onClick: () => setSelected(row.id) },
                row.courseName,
                " — ",
                row.stepTitle,
              ),
              " — ",
              row.status === "IN_PROGRESS" ? "Ожидает проверки" : "Завершён",
              " — ",
              row.createdAt.slice(0, 10),
            ),
          ),
        ),
    view.rows.length > 0 && filtered.length === 0
      ? createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              setHideCompleted(false);
              setKind("all");
            },
          },
          "Показать все результаты",
        )
      : null,
    selectedRow
      ? createElement(
          "section",
          { "aria-label": "Подробности экзамена" },
          createElement("h2", null, selectedRow.courseName + " — " + selectedRow.stepTitle),
          createElement(
            "p",
            null,
            "Статус: " + (selectedRow.status === "IN_PROGRESS" ? "Ожидает проверки" : "Завершён"),
          ),
          createElement("p", null, "Дата: " + selectedRow.createdAt.slice(0, 10)),
          createElement(
            "p",
            null,
            "Типы отчёта: " +
              [
                selectedRow.hasTestQuestions ? "тест" : null,
                selectedRow.requiresWrittenFeedback ? "письменный" : null,
                selectedRow.requiresVideoReport ? "видео" : null,
              ]
                .filter(Boolean)
                .join(", "),
          ),
        )
      : null,
  );
}

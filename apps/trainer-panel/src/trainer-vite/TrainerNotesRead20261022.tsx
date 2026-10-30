import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
const note = z
  .object({
    id: z.string().min(1),
    title: z.string().nullable(),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
  })
  .strict();
const responseSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        notes: z.array(note),
        total: z.number().int().nonnegative(),
        page: z.number().int().nonnegative(),
        pageSize: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
import type { TrainerNotesSummaryPage } from "@gafus/types";
type Notes = TrainerNotesSummaryPage;
type _NotesWireCheck = z.infer<typeof responseSchema>["data"] extends Notes ? true : never;
export type NotesReadTransport = (
  path: string,
  signal: AbortSignal,
) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export const NOTES_SUMMARY_PATH = "/api/v1/trainer/notes/summary";
export function TrainerNotesRead20261022(p: {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enabled?: boolean;
  pageSize?: number;
  transport?: NotesReadTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const size =
    p.pageSize !== undefined && Number.isInteger(p.pageSize) && p.pageSize >= 1 && p.pageSize <= 50
      ? p.pageSize
      : 50;
  const [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const [view, setView] = useState<{
    scope: string;
    phase: "loading" | "ready" | "error" | "denied";
    data?: Notes;
  }>({ scope: "", phase: "loading" });
  const scope = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch, page, size]);
  // The confirmed response itself is the one-use navigation permit: never trust
  // an old button/closure after page or actor retirement.
  const confirmedPageRef = useRef<Notes | null>(null);
  const renderedScopeRef = useRef(scope);
  const renderedAllowedRef = useRef(false);
  renderedScopeRef.current = scope;
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
    p.pathname === "/main-panel/notes" &&
    p.enabled === true &&
    !!p.token &&
    !!p.authEpoch &&
    !!p.transport &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role) &&
    current();
  renderedAllowedRef.current = allowed;
  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    setView({ scope, phase: "loading" });
    if (allowed)
      void (async () => {
        const result = await p.transport!(
          `${NOTES_SUMMARY_PATH}?page=${page}&pageSize=${size}`,
          abort.signal,
        );
        if (!live || abort.signal.aborted || !current()) return;
        if (result.status === 403) throw Error("TERMINAL_403");
        const cache = (result.headers["cache-control"] ?? "").toLowerCase();
        if (result.status !== 200 || !cache.includes("private") || !cache.includes("no-store"))
          throw Error("BAD_READ");
        const data = responseSchema.parse(result.body).data;
        if (data.page !== page || data.pageSize !== size) throw Error("BAD_PAGE");
        if (live && current()) {
          confirmedPageRef.current = data;
          setView({ scope, phase: "ready", data });
        }
      })().catch((error: unknown) => {
        if (live && current()) {
          confirmedPageRef.current = null;
          setView({
            scope,
            phase: error instanceof Error && error.message === "TERMINAL_403" ? "denied" : "error",
          });
        }
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [scope, allowed, retry, p.transport, current, page, size]);
  if (!allowed)
    return createElement("main", null, createElement("p", { role: "alert" }, "Заметки недоступны"));
  const v = view.scope === scope ? view : { phase: "loading" as const };
  const navigatePage = (direction: -1 | 1) => {
    if (
      !allowed || !renderedAllowedRef.current || !current() ||
      renderedScopeRef.current !== scope || v.phase !== "ready" ||
      !("data" in v) || !v.data || confirmedPageRef.current !== v.data
    ) return;
    if (v.data.page !== page || v.data.pageSize !== size) return;
    const destination = page + direction;
    if (destination < 0 || destination >= Math.ceil(v.data.total / v.data.pageSize)) return;
    // Lock synchronously, before React can paint loading or run the next GET.
    confirmedPageRef.current = null;
    setPage(destination);
  };
  if (v.phase === "loading")
    return createElement("main", null, createElement("p", { role: "status" }, "Загрузка заметок"));
  if (v.phase === "denied")
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Нет доступа к заметкам"),
      createElement("a", { href: "/main-panel" }, "Назад в панель тренера"),
    );
  if (v.phase === "error" || !("data" in v) || !v.data)
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Не удалось загрузить заметки"),
      createElement(
        "button",
        { type: "button", onClick: () => setRetry((x) => x + 1) },
        "Повторить чтение",
      ),
    );
  return createElement(
    "main",
    { "data-notes-readonly": "true" },
    createElement("h1", null, "Заметки"),
    createElement("p", null, `Всего заметок: ${v.data.total}`),
    createElement(
      "nav",
      { "aria-label": "Страницы заметок" },
      createElement(
        "button",
        { type: "button", disabled: page === 0, onClick: () => navigatePage(-1) },
        "Предыдущая страница",
      ),
      createElement("span", null, ` Страница ${page + 1} `),
      createElement(
        "button",
        {
          type: "button",
          disabled: (page + 1) * v.data.pageSize >= v.data.total,
          onClick: () => navigatePage(1),
        },
        "Следующая страница",
      ),
    ),
    v.data.notes.length === 0
      ? createElement("p", { role: "status" }, "Заметок нет")
      : createElement(
          "ul",
          null,
          ...v.data.notes.map((x) =>
            createElement(
              "li",
              { key: x.id },
              x.title ?? "Без названия",
              " — ",
              x.createdAt.slice(0, 10),
              " — ",
              x.tags.length ? x.tags.join(", ") : "Без тегов",
            ),
          ),
        ),
  );
}

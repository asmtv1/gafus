import { createElement, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
const article = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    slug: z.string(),
    visibility: z.enum(["PUBLIC", "PAID"]),
    likeCount: z.number().int().nonnegative(),
    viewCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
const envelope = z
  .object({ success: z.literal(true), data: z.object({ articles: z.array(article) }).strict() })
  .strict();
import type { TrainerArticleOwnMetadataItem } from "@gafus/types";
type Article = TrainerArticleOwnMetadataItem;
export type OwnArticlesTransport = (
  path: string,
  signal: AbortSignal,
) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
/** AG1 continuation144 registered TRAINER/ADMIN own-only metadata; never general catalog. */
export const OWN_ARTICLES_PATH = "/api/v1/trainer/articles/own-summary";
export function TrainerOwnArticlesRead20261022(p: {
  pathname: string;
  actor: PanelActor;
  token: string | null;
  authEpoch?: string;
  enabled?: boolean;
  showEditorLinks?: boolean;
  transport?: OwnArticlesTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<"newest" | "title">("newest"),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<{
    scope: string;
    phase: "loading" | "ready" | "error" | "denied";
    rows: Article[];
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
    p.pathname === "/main-panel/articles" &&
    p.enabled === true &&
    !!p.token &&
    !!p.authEpoch &&
    !!p.transport &&
    ["TRAINER", "ADMIN"].includes(p.actor.role) &&
    current();
  useEffect(() => {
    let live = true;
    const ac = new AbortController();
    setSelected(null);
    setView({ scope, phase: "loading", rows: [] });
    if (allowed)
      void (async () => {
        const result = await p.transport!(OWN_ARTICLES_PATH, ac.signal);
        if (!live || ac.signal.aborted || !current()) return;
        if (result.status === 403) throw Error("TERMINAL_403");
        const cache = (result.headers["cache-control"] ?? "").toLowerCase();
        if (result.status !== 200 || !cache.includes("private") || !cache.includes("no-store"))
          throw Error("UNSAFE_READ");
        const rows = envelope.parse(result.body).data.articles;
        if (live && current()) setView({ scope, phase: "ready", rows });
      })().catch((error: unknown) => {
        if (live && current())
          setView({
            scope,
            phase: error instanceof Error && error.message === "TERMINAL_403" ? "denied" : "error",
            rows: [],
          });
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, [scope, allowed, retry, p.transport, current]);
  if (!allowed)
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Список собственных статей недоступен"),
    );
  const state = view.scope === scope ? view : { phase: "loading" as const, rows: [] };
  if (state.phase === "loading")
    return createElement("main", null, createElement("p", { role: "status" }, "Загрузка статей"));
  if (state.phase === "denied")
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Нет доступа к собственным статьям"),
      createElement("a", { href: "/main-panel" }, "Назад в панель тренера"),
    );
  if (state.phase === "error")
    return createElement(
      "main",
      null,
      createElement("p", { role: "alert" }, "Не удалось загрузить статьи"),
      createElement(
        "button",
        { type: "button", onClick: () => setRetry((x) => x + 1) },
        "Повторить чтение",
      ),
    );
  const rows = state.rows
    .filter((row) =>
      (row.title + " " + row.slug).toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
        : a.title.localeCompare(b.title, "ru") ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
    );
  const detail = rows.find((row) => row.id === selected);
  return createElement(
    "main",
    { "data-articles-readonly": "true" },
    createElement("h1", null, "Мои статьи"),
    createElement(
      "label",
      null,
      "Поиск по названию или slug",
      createElement("input", { value: query, onChange: (e) => setQuery(e.currentTarget.value) }),
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
        createElement("option", { value: "newest" }, "Сначала новые"),
        createElement("option", { value: "title" }, "По названию"),
      ),
    ),
    createElement("p", null, `Загружено статей: ${state.rows.length}; показано: ${rows.length}`),
    state.rows.length === 100
      ? createElement(
          "p",
          null,
          "Поиск выполняется только среди 100 загруженных статей. Другие статьи могут не входить в этот список.",
        )
      : null,
    rows.length === 0
      ? createElement(
          "p",
          { role: "status" },
          state.rows.length === 0 ? "Статей пока нет" : "По запросу ничего не найдено",
        )
      : createElement(
          "ul",
          null,
          ...rows.map((row) =>
            createElement(
              "li",
              { key: row.id },
              createElement(
                "button",
                { type: "button", onClick: () => setSelected(row.id) },
                row.title,
              ),
              " — ",
              row.slug,
              " — ",
              row.visibility,
              " — лайков: ",
              row.likeCount,
              " — просмотров: ",
              row.viewCount,
              p.showEditorLinks
                ? createElement("a", {
                  href: "/main-panel/articles/" + encodeURIComponent(row.id) + "/edit",
                }, " Редактировать")
                : null,
            ),
          ),
        ),
    state.rows.length > 0 && rows.length === 0 && query.length > 0
      ? createElement(
          "button",
          { type: "button", onClick: () => setQuery("") },
          "Очистить поиск",
        )
      : null,
    detail
      ? createElement(
          "section",
          { "aria-label": "Метаданные статьи" },
          createElement("h2", null, detail.title),
          createElement("p", null, "Slug: " + detail.slug),
          createElement("p", null, "Видимость: " + detail.visibility),
          createElement("p", null, "Создана: " + detail.createdAt.slice(0, 10)),
          createElement("p", null, "Изменена: " + detail.updatedAt.slice(0, 10)),
        )
      : null,
  );
}

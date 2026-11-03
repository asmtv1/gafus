import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod/v3";
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
import type { ArticleViewerDto, TrainerArticleOwnMetadataItem } from "@gafus/types";
import type { TrainerArticleWriteTransport } from "./TrainerArticleEditorRoute";
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
  writeTransport?: TrainerArticleWriteTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<"newest" | "title" | "updated" | "views" | "likes">("newest"),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"ALL" | "PUBLIC" | "PAID">("ALL");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewers, setViewers] = useState<{
    id: string; title: string; phase: "loading" | "ready" | "error"; rows: ArticleViewerDto[];
  } | null>(null);
  const actionRef = useRef<AbortController | null>(null);
  const viewerRef = useRef<AbortController | null>(null);
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
    setSelected(null); setViewers(null);
    viewerRef.current?.abort(); actionRef.current?.abort();
    setBusy(false);
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
      viewerRef.current?.abort(); actionRef.current?.abort();
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
  const safeCache = (headers: Record<string, string>) => {
    const flags = (headers["cache-control"] ?? "").toLowerCase().split(",").map(v => v.trim());
    return flags.includes("private") && flags.includes("no-store") && !flags.includes("public");
  };
  const viewersSchema = z.object({ success: z.literal(true), data: z.object({
    viewers: z.array(z.object({
      userId: z.string().min(1), username: z.string(), fullName: z.string().nullable(),
      lastViewedAt: z.string().datetime(),
    }).strict()),
  }).strict() }).strict();
  function closeViewers() { viewerRef.current?.abort(); setViewers(null); }
  async function showViewers(row: Article) {
    if (!allowed || !current() || !p.transport) return;
    viewerRef.current?.abort();
    const ctl = new AbortController();
    viewerRef.current = ctl;
    setViewers({ id: row.id, title: row.title, phase: "loading", rows: [] });
    try {
      const result = await p.transport(OWN_ARTICLES_PATH + "/" +
        encodeURIComponent(row.id) + "/viewers", ctl.signal);
      if (ctl.signal.aborted || !current()) return;
      if (result.status !== 200 || !safeCache(result.headers)) throw Error("VIEWERS_UNAVAILABLE");
      setViewers({ id: row.id, title: row.title, phase: "ready",
        rows: viewersSchema.parse(result.body).data.viewers });
    } catch {
      if (!ctl.signal.aborted && current())
        setViewers({ id: row.id, title: row.title, phase: "error", rows: [] });
    }
  }
  async function deleteArticle(row: Article) {
    if (!allowed || !current() || !p.showEditorLinks || !p.writeTransport ||
        !p.transport || busy || !window.confirm(`Удалить статью «${row.title}»? Это необратимо.`)) return;
    setBusy(true); setNotice("");
    const ctl = new AbortController();
    actionRef.current = ctl;
    const url = "/api/v1/trainer/articles/manage/" + encodeURIComponent(row.id);
    try {
      const response = await p.writeTransport({ method: "DELETE", path: url, signal: ctl.signal });
      if (ctl.signal.aborted || !current()) return;
      if (response.status !== 200 || !safeCache(response.headers) ||
          !response.body || typeof response.body !== "object" ||
          !("success" in response.body) || response.body.success !== true)
        throw Error("DELETE_NOT_CONFIRMED");
      const again = await p.transport(url, ctl.signal);
      if (ctl.signal.aborted || !current()) return;
      if (again.status !== 404 || !safeCache(again.headers))
        throw Error("DELETE_READBACK_FAILED");
      closeViewers(); setSelected(null);
      setNotice("Удаление подтверждено сервером.");
      setRetry(value => value + 1);
    } catch {
      if (!ctl.signal.aborted && current())
        setNotice("Удаление не подтверждено. Проверьте статью и обновите список.");
    } finally {
      if (actionRef.current === ctl) actionRef.current = null;
      if (current()) setBusy(false);
    }
  }
  const displayDate = (iso: string, time = false) => new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
  const rows = state.rows.filter(row =>
    (visibility === "ALL" || row.visibility === visibility) &&
    (row.title + " " + row.slug).toLocaleLowerCase("ru")
      .includes(query.trim().toLocaleLowerCase("ru")),
  ).sort((a, b) => {
    const tie = a.title.localeCompare(b.title, "ru") || a.id.localeCompare(b.id);
    if (sort === "title") return tie;
    if (sort === "views") return b.viewCount - a.viewCount || tie;
    if (sort === "likes") return b.likeCount - a.likeCount || tie;
    if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt) || tie;
    return b.createdAt.localeCompare(a.createdAt) || tie;
  });
  const detail = rows.find(row => row.id === selected);
  const totalLikes = state.rows.reduce((sum, row) => sum + row.likeCount, 0);
  const totalViews = state.rows.reduce((sum, row) => sum + row.viewCount, 0);
  const publicCount = state.rows.filter(row => row.visibility === "PUBLIC").length;
  function clearSearch() { setQuery(""); setVisibility("ALL"); }
  return <main className="trainer-articles-page" data-articles-readonly="true">
    <header className="trainer-articles-heading">
      <div><span className="trainer-articles-eyebrow">Библиотека материалов</span>
        <h1>Мои статьи</h1><p>Управляйте публикациями и отслеживайте интерес читателей.</p></div>
      {p.showEditorLinks && <a href="/articles/new" className="trainer-articles-create">
        <span aria-hidden="true">＋</span> Создать статью</a>}
    </header>
    <div className="trainer-articles-metrics" aria-label="Статистика загруженных статей">
      <div><span>Статьи</span><strong>{state.rows.length}</strong>
        <small>Загружено в список</small></div>
      <div><span>Публичные</span><strong>{publicCount}</strong><small>Доступны всем</small></div>
      <div><span>Просмотры</span><strong>{totalViews.toLocaleString("ru-RU")}</strong>
        <small>По загруженным статьям</small></div>
      <div><span>Лайки</span><strong>{totalLikes.toLocaleString("ru-RU")}</strong>
        <small>По загруженным статьям</small></div>
    </div>
    <section className="trainer-articles-library" aria-label="Управление статьями">
      <div className="trainer-articles-library-header"><div><h2>Публикации</h2>
        <p>Поиск, аналитика и редактирование материалов</p></div>
        <button type="button" className="trainer-articles-refresh" disabled={busy}
          onClick={() => setRetry(v => v + 1)}>↻ Обновить</button></div>
      <div className="trainer-articles-controls">
        <label className="trainer-articles-search">Поиск по названию или slug
          <input type="search" value={query} placeholder="Название статьи или адрес…"
            onChange={e => setQuery(e.currentTarget.value)} /></label>
        <label>Видимость<select value={visibility}
          onChange={e => setVisibility(e.currentTarget.value as typeof visibility)}>
          <option value="ALL">Все статьи</option><option value="PUBLIC">Публичные</option>
          <option value="PAID">По подписке</option></select></label>
        <label>Сортировка<select value={sort}
          onChange={e => setSort(e.currentTarget.value as typeof sort)}>
          <option value="newest">Сначала новые</option><option value="updated">Недавно изменённые</option>
          <option value="title">По названию</option><option value="views">По просмотрам</option>
          <option value="likes">По лайкам</option></select></label>
      </div>
      <div className="trainer-articles-results">
        <p>Загружено статей: {state.rows.length}; показано: {rows.length}</p>
        {(query || visibility !== "ALL") && <button type="button" className="trainer-articles-clear"
          onClick={clearSearch}>Очистить поиск</button>}
      </div>
      {state.rows.length === 100 && <p role="note" className="trainer-articles-warning">
        Поиск выполняется только среди 100 загруженных статей.
        Другие статьи могут не входить в этот список.
      </p>}
      {notice && <p role="status" className="trainer-articles-notice">{notice}</p>}
      {detail && <section className="trainer-articles-detail" aria-label="Метаданные статьи">
        <div><h3>{detail.title}</h3><button type="button" aria-label="Закрыть сведения о статье"
          onClick={() => setSelected(null)}>×</button></div>
        <p>Slug: {detail.slug} · Видимость: {detail.visibility === "PUBLIC" ? "Публичная" : "По подписке"}</p>
        <p>Создана: {detail.createdAt.slice(0, 10)} · Изменена: {detail.updatedAt.slice(0, 10)}</p>
        {p.showEditorLinks && <a href={"/articles/" + encodeURIComponent(detail.id) + "/edit"}>
          Открыть редактор</a>}
      </section>}
      {rows.length === 0 ? <div className="trainer-articles-empty" role="status">
        <span aria-hidden="true">▤</span>
        <strong>{state.rows.length === 0 ? "Статей пока нет" : "По запросу ничего не найдено"}</strong>
        <p>{state.rows.length === 0 ? "Создайте первую статью, чтобы она появилась здесь." :
          "Измените поиск или сбросьте фильтр видимости."}</p>
        {state.rows.length === 0 && p.showEditorLinks && <a href="/articles/new">Создать статью</a>}
      </div> : <div className="trainer-articles-table-wrap">
        <table className="trainer-articles-table">
          <thead><tr><th scope="col">Публикация</th><th scope="col">Доступ</th>
            <th scope="col" className="trainer-articles-numeric">Лайки</th>
            <th scope="col" className="trainer-articles-numeric">Просмотры</th>
            <th scope="col">Изменена</th><th scope="col">Действия</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td className="trainer-articles-title-cell" data-label="Публикация">
              <button type="button" className="trainer-articles-title-button"
                onClick={() => setSelected(selected === row.id ? null : row.id)}>
                {row.title}</button>
              <small className="trainer-articles-slug" title={row.slug}>/{row.slug}</small>
            </td>
            <td data-label="Доступ"><span className={"trainer-articles-status " +
              (row.visibility === "PUBLIC" ? "is-public" : "is-paid")}>
              <span aria-hidden="true" />
              {row.visibility === "PUBLIC" ? "Публичная" : "По подписке"}</span></td>
            <td data-label="Лайки" className="trainer-articles-numeric"><span className="trainer-articles-count">
              <span aria-hidden="true">♡</span> {row.likeCount.toLocaleString("ru-RU")}</span></td>
            <td data-label="Просмотры" className="trainer-articles-numeric"><span className="trainer-articles-count">
              <span aria-hidden="true">◉</span> {row.viewCount.toLocaleString("ru-RU")}</span></td>
            <td data-label="Изменена" className="trainer-articles-date">{displayDate(row.updatedAt)}</td>
            <td data-label="Действия"><div className="trainer-articles-actions">
              <button type="button" className="trainer-articles-viewers"
                title="Кто смотрел (авторизованные пользователи)"
                aria-label={"Кто смотрел: " + row.title}
                onClick={() => void showViewers(row)}>Читатели</button>
              {p.showEditorLinks && <a className="trainer-articles-edit"
                href={"/articles/" + encodeURIComponent(row.id) + "/edit"}>Редактировать</a>}
              {p.showEditorLinks && p.writeTransport && <button type="button"
                className="trainer-articles-delete" disabled={busy}
                aria-label={"Удалить статью: " + row.title}
                onClick={() => void deleteArticle(row)}>Удалить</button>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    {viewers && <div className="trainer-articles-modal-layer" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) closeViewers(); }}>
      <section className="trainer-articles-modal" role="dialog" aria-modal="true"
        aria-label={"Просмотры: " + viewers.title}>
        <header><div><h2>Читатели статьи</h2><p>{viewers.title}</p></div>
          <button type="button" onClick={closeViewers} aria-label="Закрыть список читателей">×</button>
        </header>
        <p className="trainer-articles-modal-note">Показываются только авторизованные пользователи.
          Гостевые посещения учитываются в общем числе просмотров.</p>
        {viewers.phase === "loading" && <p role="status">Загружаем читателей…</p>}
        {viewers.phase === "error" && <p role="alert">Не удалось загрузить список читателей.
          <button type="button" onClick={() => {
            const row = state.rows.find(item => item.id === viewers.id);
            if (row) void showViewers(row);
          }}>Повторить</button></p>}
        {viewers.phase === "ready" && (viewers.rows.length === 0
          ? <p role="status">Пока нет авторизованных просмотров.</p>
          : <ul className="trainer-articles-viewers-list">{viewers.rows.map(reader => <li key={reader.userId}>
            <span className="trainer-articles-reader-avatar" aria-hidden="true">
              {(reader.fullName || reader.username).slice(0, 1).toLocaleUpperCase("ru")}</span>
            <div><strong>{reader.fullName || reader.username}</strong>
              <small>{reader.fullName ? "@" + reader.username + " · " : ""}
                {displayDate(reader.lastViewedAt, true)}</small></div>
          </li>)}</ul>)}
        <footer><button type="button" onClick={closeViewers}>Закрыть</button></footer>
      </section>
    </div>}
  </main>;
}

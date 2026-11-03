import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { VideoMetadataTransport } from "./TrainerVideosMetadataRead20261022";
const TrainerVideoPlayer = lazy(() => import("./live/TrainerVideoPlayer"));
const catalogPath = "/api/v1/trainer/videos/catalog";

const video = z.object({
  id: z.string().min(1), displayName: z.string().nullable(),
  originalName: z.string().optional(), fileSize: z.number().nonnegative().optional(),
  hasThumbnail: z.boolean().optional(), hasPlayback: z.boolean().optional(),
  ownerName: z.string().nullable().optional(),
  transcodingStatus: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]),
  durationSec: z.number().nonnegative().nullable(), createdAt: z.string().datetime(),
}).strict();
const envelope = z.object({
  success: z.literal(true), data: z.object({ videos: z.array(video) }).strict(),
}).strict();
type Video = z.infer<typeof video>;
export type TrainerVideoManageTransport = (req: {
  method: "PUT" | "POST"; path: string; body?: { displayName: string | null };
  signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
const privateCache = (headers: Record<string, string>) => {
  const parts = (headers["cache-control"] ?? "").toLowerCase().split(",").map(s => s.trim());
  return parts.includes("private") && parts.includes("no-store") && !parts.includes("public");
};
export function TrainerVideosManageRoute(p: {
  pathname: string; actor: PanelActor; token: string | null; authEpoch?: string;
  enabled?: boolean; videoReadTransport?: VideoMetadataTransport;
  videoWriteTransport?: TrainerVideoManageTransport;
  getCurrentSession?: () => { actor: PanelActor; token: string | null; authEpoch?: string } | null;
}) {
  const [state, setState] = useState<{
    phase: "loading" | "ready" | "denied" | "error"; videos: Video[];
  }>({ phase: "loading", videos: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Video["transcodingStatus"]>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingRef = useRef<AbortController | null>(null);
  const playbackRef = useRef<AbortController | null>(null);
  const currentSessionRef = useRef(p.getCurrentSession);
  currentSessionRef.current = p.getCurrentSession;
  const actorId = p.actor.id, role = p.actor.role, token = p.token, epoch = p.authEpoch;
  const current = useCallback(() => {
    const live = currentSessionRef.current?.();
    return !!live && live.actor.id === actorId && live.actor.role === role &&
      live.token === token && live.authEpoch === epoch;
  }, [actorId, role, token, epoch]);
  const allowed = !!p.enabled && p.pathname === "/main-panel/my-videos" &&
    !!token && !!epoch && (role === "TRAINER" || role === "ADMIN") &&
    !!p.videoReadTransport && !!p.videoWriteTransport && current();
  const read = p.videoReadTransport;
  useEffect(() => {
    const active = pendingRef;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      active.current?.abort();
      playbackRef.current?.abort();
    };
  }, [actorId, role, token, epoch]);
  useEffect(() => {
    if (!allowed || !read) return;
    let live = true;
    const ctl = new AbortController();
    setState({ phase: "loading", videos: [] });
    setSelectedId(null); setPlayingId(null); setPlayingUrl("");
    void read(catalogPath, ctl.signal)
      .then(response => {
        if (!live || ctl.signal.aborted || !current()) return;
        if (response.status === 401 || response.status === 403) {
          setState({ phase: "denied", videos: [] }); return;
        }
        if (response.status !== 200 || !privateCache(response.headers))
          throw Error("UNSAFE_VIDEO_DATA");
        setState({ phase: "ready", videos: envelope.parse(response.body).data.videos });
      }).catch(() => {
        if (live && !ctl.signal.aborted && current())
          setState({ phase: "error", videos: [] });
      });
    return () => { live = false; ctl.abort(); };
  }, [allowed, read, current, refresh]);
  const selected = state.videos.find(row => row.id === selectedId) ?? null;
  function pick(row: Video) {
    if (!current() || busyRef.current) return;
    setSelectedId(row.id);
    setDisplayName(row.displayName ?? "");
    setNotice("");
  }
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || !current() || busyRef.current || !selected ||
      state.phase !== "ready" || displayName.length > 255) return;
    busyRef.current = true; setBusy(true); setNotice("");
    const ctl = new AbortController();
    pendingRef.current = ctl;
    try {
      const requestedName = displayName.trim() || null;
      const response = await p.videoWriteTransport!({
        method: "PUT",
        path: "/api/v1/trainer/videos/manage/" + encodeURIComponent(selected.id) + "/name",
        body: { displayName: requestedName }, signal: ctl.signal,
      });
      if (ctl.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status === 401 || response.status === 403) {
        setState({ phase: "denied", videos: [] }); return;
      }
      if (response.status !== 200 || !privateCache(response.headers) ||
        !response.body || typeof response.body !== "object" ||
        !("success" in response.body) || response.body.success !== true)
        throw Error("RENAME_UNCONFIRMED");
      const again = await p.videoReadTransport!(
        catalogPath, ctl.signal);
      if (ctl.signal.aborted || !mountedRef.current || !current()) return;
      if (again.status !== 200 || !privateCache(again.headers))
        throw Error("READBACK_FAILED");
      const rows = envelope.parse(again.body).data.videos;
      if (!rows.some(row => row.id === selected.id &&
        row.displayName === requestedName)) throw Error("NAME_MISMATCH");
      setState({ phase: "ready", videos: rows });
      setNotice("Название подтверждено сервером.");
    } catch {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setNotice("Обновление не подтверждено. Повторите загрузку списка.");
    } finally {
      if (pendingRef.current === ctl) pendingRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setBusy(false);
    }
  }
  async function play(row: Video) {
    if (!allowed || !current() || !row.hasPlayback || busyRef.current || loadingPlayer) return;
    if (playingId === row.id && playingUrl) {
      setPlayingId(null); setPlayingUrl(""); return;
    }
    playbackRef.current?.abort();
    const ctl = new AbortController();
    playbackRef.current = ctl;
    setPlayingId(row.id); setPlayingUrl(""); setPlayerError(""); setLoadingPlayer(true);
    try {
      const response = await p.videoWriteTransport!({
        method: "POST", path: "/api/v1/trainer/videos/playback/" + encodeURIComponent(row.id),
        signal: ctl.signal,
      });
      if (ctl.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status !== 200 || !privateCache(response.headers))
        throw Error("PLAYBACK_DENIED");
      const checked = z.object({ success: z.literal(true), data: z.object({ url: z.string() }) })
        .parse(response.body).data.url;
      const exactPrefix = "/api/v1/training/video/" + encodeURIComponent(row.id) +
        "/manifest.m3u8?token=";
      const ticket = checked.slice(exactPrefix.length);
      if (!checked.startsWith(exactPrefix) || !/^[A-Za-z0-9%._-]+$/.test(ticket))
        throw Error("UNTRUSTED_PLAYBACK_URL");
      setPlayingUrl(checked);
    } catch {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setPlayerError("Не удалось открыть видео. Проверьте права доступа и попробуйте снова.");
    } finally {
      if (playbackRef.current === ctl) playbackRef.current = null;
      if (mountedRef.current && current()) setLoadingPlayer(false);
    }
  }
  const title = (row: Video) => row.displayName?.trim() || row.originalName || "Без названия";
  const formatSize = (bytes?: number) => bytes === undefined ? "—" :
    bytes >= 1024 * 1024 * 1024 ? (bytes / 1024 ** 3).toFixed(2) + " ГБ" :
      bytes >= 1024 * 1024 ? (bytes / 1024 ** 2).toFixed(1) + " МБ" :
        (bytes / 1024).toFixed(1) + " КБ";
  const formatTime = (seconds: number | null) => seconds === null ? "—" :
    Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
  const formatDate = (iso: string) => new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
  const labels = { COMPLETED: "Готово", PROCESSING: "Обрабатывается",
    PENDING: "В очереди", FAILED: "Ошибка обработки" } as const;
  if (!allowed) return <main role="alert">Видео недоступны текущей сессии</main>;
  if (state.phase === "loading") return <main role="status">Загрузка видео…</main>;
  if (state.phase === "denied") return <main role="alert">Доступ к видео запрещён</main>;
  if (state.phase === "error") return <main><p role="alert">Ошибка загрузки видео</p>
    <button type="button" onClick={() => setRefresh(v => v + 1)}>Повторить</button>
  </main>;
  const matched = state.videos.filter(row =>
    (filter === "all" || row.transcodingStatus === filter) &&
    (title(row).toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")) ||
      (row.originalName ?? "").toLocaleLowerCase("ru")
        .includes(query.trim().toLocaleLowerCase("ru")) ||
      row.ownerName?.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))),
  ).sort((a, b) => sort === "name" ? title(a).localeCompare(title(b), "ru") :
    sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) :
      b.createdAt.localeCompare(a.createdAt));
  return <main className="trainer-videos-page" data-trainer-videos="catalog">
    <header className="trainer-videos-header">
      <h1>Мои видео</h1>
      <p>Загружайте личные видео для использования в шагах, экзаменах и курсах</p>
    </header>
    <section className="trainer-videos-upload" aria-labelledby="trainer-upload-title">
      <div className="trainer-videos-section-top">
        <div><h2 id="trainer-upload-title">Загрузка видео</h2>
          <p>Поддерживаются MP4, WebM и MOV. Максимальный размер файла — 3 ГБ.</p></div>
        <span className="trainer-videos-upload-state">Временно недоступна</span>
      </div>
      <div className="trainer-videos-dropzone" aria-disabled="true">
        <span className="trainer-videos-cloud" aria-hidden="true">☁</span>
        <strong>Перетащите видео сюда</strong>
        <span>или выберите файлы на компьютере</span>
        <button type="button" disabled title="Для загрузки необходим защищённый Hono API">
          Выбрать файлы
        </button>
      </div>
      <p className="trainer-videos-help">Загрузка новых файлов временно недоступна: требуется перенос защищённого маршрута загрузки и очереди обработки из Next. Существующие видео можно просматривать и переименовывать.</p>
    </section>
    <section className="trainer-videos-library" aria-label="Библиотека видео">
      <div className="trainer-videos-section-top">
        <div><h2>Библиотека видео</h2>
          <p>Всего видео: {state.videos.length} · Показано: {matched.length}</p></div>
        <button type="button" className="trainer-videos-refresh" disabled={busy}
          onClick={() => setRefresh(v => v + 1)}>↻ Обновить</button>
      </div>
      <div className="trainer-videos-filters">
        <label>Поиск видео
          <input type="search" value={query} placeholder="По названию или файлу…"
            onChange={event => setQuery(event.target.value)} />
        </label>
        <label>Статус
          <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
            <option value="all">Все видео</option>
            <option value="COMPLETED">Готовые</option>
            <option value="PROCESSING">Обрабатываются</option>
            <option value="PENDING">В очереди</option>
            <option value="FAILED">С ошибкой</option>
          </select>
        </label>
        <label>Сортировка
          <select value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="name">По названию</option>
          </select>
        </label>
      </div>
      {notice && <p className="trainer-videos-notice" role="status">{notice}</p>}
      {!matched.length && <div className="trainer-videos-empty" role="status">
        <strong>{state.videos.length ? "Ничего не найдено" : "Видео ещё не загружены"}</strong>
        <span>{state.videos.length ? "Попробуйте изменить параметры поиска." : "Здесь появятся загруженные видео."}</span>
      </div>}
      <div className="trainer-videos-grid">
        {matched.map(row => <article className="trainer-video-card" key={row.id}>
          <div className="trainer-video-cover">
            {playingId === row.id && playingUrl ?
              <Suspense fallback={<div className="trainer-video-placeholder">Загрузка плеера…</div>}>
                <TrainerVideoPlayer src={playingUrl} />
              </Suspense> : row.hasPlayback ?
              <button className="trainer-video-play" type="button"
                aria-label={"Смотреть видео: " + title(row)} disabled={loadingPlayer}
                onClick={() => void play(row)}>
                {row.hasThumbnail && <img loading="lazy" alt="" referrerPolicy="no-referrer"
                  src={"/api/v1/trainer/videos/poster/" + encodeURIComponent(row.id)}
                  onError={event => { event.currentTarget.hidden = true; }} />}
                <span className="trainer-video-play-icon" aria-hidden="true">▶</span>
                <span className="trainer-video-play-label">Смотреть видео</span>
              </button> : <div className="trainer-video-placeholder">
                <span className="trainer-video-placeholder-icon" aria-hidden="true">▣</span>
                <span>{row.transcodingStatus === "PENDING" ? "Видео в очереди на обработку" :
                  row.transcodingStatus === "PROCESSING" ? "Видео обрабатывается" :
                  row.transcodingStatus === "FAILED" ? "Ошибка обработки видео" :
                  "Видео пока недоступно"}</span>
              </div>}
            {row.durationSec !== null &&
              <span className="trainer-video-duration">{formatTime(row.durationSec)}</span>}
          </div>
          <div className="trainer-video-content">
            {selectedId === row.id ?
              <form className="trainer-video-rename" onSubmit={event => void rename(event)}>
                <label>Новое название
                  <input maxLength={255} value={displayName} autoFocus disabled={busy}
                    onChange={event => setDisplayName(event.target.value)} />
                </label>
                <div className="trainer-video-rename-actions">
                  <button type="submit" disabled={busy}>Сохранить название</button>
                  <button type="button" className="trainer-video-cancel" disabled={busy}
                    onClick={() => setSelectedId(null)}>Отмена</button>
                </div>
              </form> : <div className="trainer-video-title-row">
                <button className="trainer-video-title" title={title(row)} type="button"
                  disabled={busy} onClick={() => pick(row)}>{title(row)}</button>
                <button type="button" className="trainer-video-icon-button"
                  title="Редактировать название" aria-label={"Переименовать: " + title(row)}
                  disabled={busy} onClick={() => pick(row)}>✎</button>
              </div>}
            <div className="trainer-video-meta">
              {row.ownerName && <p>Владелец: {row.ownerName}</p>}
              <p>Размер: {formatSize(row.fileSize)}</p>
              <p>Загружено: {formatDate(row.createdAt)}</p>
            </div>
            <div className="trainer-video-card-footer">
              <span className={"trainer-video-status trainer-video-status-" + row.transcodingStatus.toLowerCase()}>
                {labels[row.transcodingStatus]}
              </span>
              <button type="button" className="trainer-video-delete" disabled
                title="Удаление ещё не перенесено в защищённый Hono API">Удалить</button>
            </div>
            {playingId === row.id && loadingPlayer && <p role="status">Открываем видео…</p>}
            {playingId === row.id && playerError && <p role="alert">{playerError}</p>}
            {playingId === row.id && playingUrl && <button type="button"
              className="trainer-video-close-player" onClick={() => {
                setPlayingId(null); setPlayingUrl("");
              }}>Закрыть плеер</button>}
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}

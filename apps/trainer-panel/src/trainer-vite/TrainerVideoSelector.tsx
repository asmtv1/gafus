import { useEffect, useMemo, useState } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { VideoMetadataTransport } from "./TrainerVideosMetadataRead20261022";
import { matchesCatalogSearch } from "./live/trainerCatalogSearch";

const videoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: z.string().min(1), videoUrl: z.string().url().max(2000),
  durationSec: z.number().int().nonnegative().nullable(), createdAt: z.string().datetime(),
}).strict();
const responseSchema = z.object({
  success: z.literal(true), data: z.object({ videos: z.array(videoSchema) }).strict(),
}).strict();
type Video = z.infer<typeof videoSchema>;
type Session = { actor: PanelActor; token: string | null; authEpoch?: string } | null;

export function TrainerVideoSelector(p: {
  /** Legacy one-video consumer; new step forms use the ordered values array. */
  value?: string; onChange?: (url: string) => void;
  values?: string[]; onChangeValues?: (urls: string[]) => void;
  disabled?: boolean;
  actor: PanelActor; token: string | null; authEpoch?: string;
  videoMetadataTransport?: VideoMetadataTransport;
  getCurrentSession?: () => Session;
}) {
  const multiple = !!p.onChangeValues;
  const selectedUrls = p.values ?? (p.value ? [p.value] : []);
  const firstUrl = selectedUrls[0] ?? "";
  const commit = (urls: string[]) => {
    if (!valid() || p.disabled || urls.length > 8) return;
    if (multiple) p.onChangeValues?.(urls);
    else p.onChange?.(urls[0] ?? "");
  };
  const isLibrary = (value: string) =>
    /^https:\/\/gafus-media\.storage\.yandexcloud\.net\/uploads\/trainers\/[A-Za-z0-9_-]+\/videocourses\/[A-Za-z0-9_-]+\//.test(value);
  const [mode, setMode] = useState<"url" | "library">(isLibrary(firstUrl) ? "library" : "url");
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [external, setExternal] = useState(isLibrary(firstUrl) ? "" : firstUrl);
  const [state, setState] = useState<{
    phase: "idle" | "loading" | "error" | "ready" | "denied"; videos: Video[];
  }>({ phase: "idle", videos: [] });
  const scope = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const valid = () => {
    const session = p.getCurrentSession ? p.getCurrentSession() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!session && !!p.token && session.actor.id === p.actor.id &&
      session.actor.role === p.actor.role && session.token === p.token &&
      session.authEpoch === p.authEpoch &&
      (p.actor.role === "ADMIN" || p.actor.role === "TRAINER");
  };
  useEffect(() => {
    if (mode !== "library" || !valid() || !p.videoMetadataTransport) return;
    let live = true;
    const controller = new AbortController();
    setState({ phase: "loading", videos: [] });
    void p.videoMetadataTransport("/api/v1/trainer/videos/selectable", controller.signal)
      .then(result => {
        if (!live || controller.signal.aborted || !valid()) return;
        if (result.status === 401 || result.status === 403) {
          setState({ phase: "denied", videos: [] }); return;
        }
        const cache = (result.headers["cache-control"] ?? "").toLowerCase().split(",")
          .map(v => v.trim());
        if (result.status !== 200 || !cache.includes("private") ||
            !cache.includes("no-store") || cache.includes("public"))
          throw Error("UNSAFE_VIDEO_LIST");
        const rows = responseSchema.parse(result.body).data.videos;
        // A staff video ID is never enough to trust an arbitrary origin.
        if (rows.some(row => !/^https:\/\/gafus-media\.storage\.yandexcloud\.net\/uploads\/trainers\/[A-Za-z0-9_-]+\/videocourses\/[A-Za-z0-9_-]+\//.test(row.videoUrl)))
          throw Error("UNSAFE_VIDEO_REFERENCE");
        setState({ phase: "ready", videos: rows });
      }).catch(() => {
        if (live && !controller.signal.aborted && valid())
          setState({ phase: "error", videos: [] });
      });
    return () => { live = false; controller.abort(); };
    // Scope (not the caller's transient session callback) fences every read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, mode, retry, p.videoMetadataTransport]);
  const videos = useMemo(() => state.videos.filter(row =>
    matchesCatalogSearch(query, [row.title, row.id])), [query, state.videos]);
  function changeMode(next: "library" | "url") {
    if (p.disabled || !valid()) return;
    if (mode === "url" && !multiple) setExternal(firstUrl);
    setMode(next);
    if (!multiple) {
      if (next === "url") commit(external ? [external] : []);
      else commit([]);
    }
  }
  const selected = state.videos.find(row => row.videoUrl === firstUrl);
  const add = (url: string) => commit(
    selectedUrls.includes(url) ? selectedUrls.filter(entry => entry !== url) :
      multiple ? [...selectedUrls, url] : [url],
  );
  const move = (index: number, delta: number) => {
    const next = [...selectedUrls];
    const other = index + delta;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other]!, next[index]!];
    commit(next);
  };
  return <div className="trainer-video-selector" aria-label="Видео для шага">
    <div className="trainer-video-selector-tabs" role="group" aria-label="Источник видео">
      <button type="button" aria-pressed={mode === "url"}
        onClick={() => changeMode("url")} disabled={p.disabled}>Ссылка на видео</button>
      <button type="button" aria-pressed={mode === "library"}
        onClick={() => changeMode("library")} disabled={p.disabled}>Мои видео</button>
    </div>
    {mode === "url" ? <div className="trainer-video-manual">
      <label>Ссылка на видео
        <input type="url" maxLength={2000} value={multiple ? external : firstUrl}
          placeholder="https://…" onChange={event => {
            setExternal(event.target.value);
            if (!multiple) commit(event.target.value ? [event.target.value] : []);
          }} disabled={p.disabled} />
      </label>
      {multiple && <button type="button" disabled={!external.trim() ||
        !/^https:\/\/[^\s]+$/i.test(external.trim()) ||
        selectedUrls.length >= 8 || selectedUrls.includes(external.trim()) || p.disabled}
        onClick={() => { commit([...selectedUrls, external.trim()]); setExternal(""); }}>
        Добавить ссылку</button>}
    </div> : <section className="trainer-video-selector-library" aria-label="Библиотека видео">
      {state.phase === "loading" && <p role="status">Загрузка моих видео…</p>}
      {state.phase === "denied" && <p role="alert">Нет доступа к библиотеке видео.</p>}
      {(!p.videoMetadataTransport || state.phase === "error") &&
        <p role="alert">Не удалось загрузить мои видео.
          {p.videoMetadataTransport && <button type="button" onClick={() => setRetry(x => x + 1)}>
            Повторить</button>}
        </p>}
      {state.phase === "ready" && <>
        <label>Найти видео
          <input type="search" value={query} placeholder="Поиск по названию…"
            onChange={event => setQuery(event.target.value)} />
        </label>
        <p className="trainer-form-hint">Выберите готовое видео. Ссылка сохраняется в шаге,
          а доступ ученика к просмотру проверяется при воспроизведении.</p>
        {!multiple && selected && <p className="trainer-video-selector-selected" role="status">
          Выбрано: {selected.title}</p>}
        {state.videos.length === 0 ? <p role="status">В библиотеке пока нет готовых видео.
          <a href="/my-videos"> Мои видео</a></p> : videos.length === 0 ?
          <p role="status">По запросу видео не найдено.</p> :
          <ul className="trainer-video-selector-grid">{videos.map(row =>
            <li key={row.id}>
              <button type="button" aria-pressed={selectedUrls.includes(row.videoUrl)}
                disabled={p.disabled || (multiple && selectedUrls.length >= 8 &&
                  !selectedUrls.includes(row.videoUrl))}
                onClick={() => add(row.videoUrl)}>
                <img alt="" loading="lazy" src={`/api/v1/trainer/videos/poster/${encodeURIComponent(row.id)}`} />
                <strong>{row.title}</strong>
                <small>{row.durationSec == null ? "—" :
                  `${Math.floor(row.durationSec / 60)}:${String(row.durationSec % 60).padStart(2,"0")}`}</small>
                <span>{selectedUrls.includes(row.videoUrl) ? "✓ Выбрано" : "Выбрать"}</span>
              </button>
            </li>)}</ul>}
      </>}
    </section>}
    {multiple && <section className="trainer-video-attached" aria-label="Прикреплённые видео">
      <h3>Видео в шаге ({selectedUrls.length} из 8)</h3>
      {selectedUrls.length === 0 ? <p>Пока не выбрано ни одного видео.</p> :
        <ol>{selectedUrls.map((url, index) => {
          const entry = state.videos.find(video => video.videoUrl === url);
          return <li key={url}>
            <span>{index + 1}. {entry?.title ?? url.split("/").pop() ?? "Видео"}</span>
            <div>
              <button type="button" aria-label={`Переместить видео ${index + 1} вверх`}
                disabled={p.disabled || index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" aria-label={`Переместить видео ${index + 1} вниз`}
                disabled={p.disabled || index === selectedUrls.length - 1}
                onClick={() => move(index, 1)}>↓</button>
              <button type="button" aria-label={`Удалить видео ${index + 1}`}
                disabled={p.disabled}
                onClick={() => commit(selectedUrls.filter((_, i) => i !== index))}>
                Удалить</button>
            </div>
          </li>;
        })}</ol>}
    </section>}
  </div>;
}

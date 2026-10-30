import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
import type { VideoMetadataTransport } from "./TrainerVideosMetadataRead20261022";

const video = z.object({
  id: z.string().min(1), displayName: z.string().nullable(),
  transcodingStatus: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]),
  durationSec: z.number().nonnegative().nullable(), createdAt: z.string().datetime(),
}).strict();
const envelope = z.object({
  success: z.literal(true), data: z.object({ videos: z.array(video) }).strict(),
}).strict();
type Video = z.infer<typeof video>;
export type TrainerVideoManageTransport = (req: {
  method: "PUT"; path: string; body: { displayName: string | null };
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
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingRef = useRef<AbortController | null>(null);
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
    return () => { mountedRef.current = false; active.current?.abort(); };
  }, [actorId, role, token, epoch]);
  useEffect(() => {
    if (!allowed || !read) return;
    let live = true;
    const ctl = new AbortController();
    setState({ phase: "loading", videos: [] });
    void read("/api/v1/trainer/videos/metadata", ctl.signal)
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
        "/api/v1/trainer/videos/metadata", ctl.signal);
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
  if (!allowed) return <main role="alert">Видео недоступны текущей сессии</main>;
  if (state.phase === "loading") return <main role="status">Загрузка видео…</main>;
  if (state.phase === "denied") return <main role="alert">Доступ к видео запрещён</main>;
  if (state.phase === "error") return <main><p role="alert">Ошибка загрузки видео</p>
    <button type="button" onClick={() => setRefresh(v => v + 1)}>Повторить</button>
  </main>;
  const matched = state.videos.filter(row =>
    (row.displayName ?? "").toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  return <main>
    <h1>Мои видео</h1>
    <p>Всего видео: {state.videos.length}</p>
    <label>Поиск видео
      <input value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <ul>{matched.map(row => <li key={row.id}>
      <button type="button" onClick={() => pick(row)} disabled={busy}>
        {row.displayName ?? "Без названия"}</button>
      {" — "}{row.transcodingStatus}
      {" — "}{row.durationSec === null ? "Длительность неизвестна" : row.durationSec + " с"}
    </li>)}</ul>
    {!matched.length && <p>Видео не найдены</p>}
    {selected && <section aria-label="Редактировать название видео">
      <h2>{selected.displayName ?? "Без названия"}</h2>
      <p>Статус обработки: {selected.transcodingStatus}</p>
      <form onSubmit={event => void rename(event)}>
        <label>Новое название
          <input value={displayName} maxLength={255} disabled={busy}
            onChange={event => setDisplayName(event.target.value)} />
        </label>
        <button type="submit" disabled={busy}>Сохранить название</button>
      </form>
    </section>}
    {notice && <p role="status">{notice}</p>}
  </main>;
}

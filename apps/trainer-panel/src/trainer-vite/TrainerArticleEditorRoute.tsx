import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  TrainerFormPage, TrainerFormSection, TrainerFormActions,
  TrainerMarkdownEditor, TrainerMediaUrls,
} from "./live/TrainerFormUI";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { OwnArticlesTransport } from "./TrainerOwnArticlesRead20261022";

const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  contentType: z.enum(["TEXT", "HTML"]),
  content: z.string(),
  visibility: z.enum(["PUBLIC", "PAID"]),
  videoUrl: z.string().nullable(),
  logoImg: z.string(),
  imageUrls: z.array(z.string()),
  slug: z.string(),
  description: z.string(),
}).strict();
const envelope = z.object({ success: z.literal(true), data: articleSchema }).strict();
type Article = z.infer<typeof articleSchema>;
export type TrainerArticleWriteTransport = (input: {
  method: "PUT" | "DELETE"; path: string;
  body?: unknown; signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
const path = /^\/main-panel\/articles\/([a-zA-Z0-9_-]{1,128})\/edit\/?$/;
const cacheSafe = (headers: Record<string, string>) => {
  const parts = (headers["cache-control"] ?? "").toLowerCase().split(",").map(x => x.trim());
  return parts.includes("private") && parts.includes("no-store") && !parts.includes("public");
};
const initial = (id: string): Article => ({
  id, title: "", contentType: "HTML", content: "", visibility: "PAID",
  videoUrl: null, logoImg: "", imageUrls: [], slug: "", description: "",
});
export function TrainerArticleEditorRoute(p: {
  pathname: string;
  actor: PanelActor; token: string | null; authEpoch?: string;
  enabled?: boolean;
  articleReadTransport?: OwnArticlesTransport;
  articleWriteTransport?: TrainerArticleWriteTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}) {
  const id = path.exec(p.pathname)?.[1] ?? null;
  const [view, setView] = useState<{
    phase: "loading" | "ready" | "error" | "denied" | "deleted";
    draft: Article;
  }>({ phase: "loading", draft: initial(id ?? "") });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const getCurrentSessionRef = useRef(p.getCurrentSession);
  getCurrentSessionRef.current = p.getCurrentSession;
  const actorId = p.actor.id, role = p.actor.role;
  const token = p.token, epoch = p.authEpoch;
  const current = useCallback(() => {
    const now = getCurrentSessionRef.current?.();
    return !!now && now.actor.id === actorId && now.actor.role === role &&
      now.token === token && now.authEpoch === epoch;
  }, [actorId, role, token, epoch]);
  const allowed = !!id && !!p.enabled && !!token && !!epoch &&
    (role === "TRAINER" || role === "ADMIN") &&
    !!p.articleReadTransport && !!p.articleWriteTransport && current();
  useEffect(() => {
    const request = requestRef;
    mountedRef.current = true;
    return () => { mountedRef.current = false; request.current?.abort(); };
  }, [actorId, role, token, epoch, id]);
  const api = id ? "/api/v1/trainer/articles/manage/" + encodeURIComponent(id) : "";
  const read = p.articleReadTransport;
  useEffect(() => {
    if (!allowed || !read || !id) return;
    let live = true;
    const controller = new AbortController();
    setView({ phase: "loading", draft: initial(id) });
    setMessage("");
    void read(api, controller.signal).then(result => {
      if (!live || controller.signal.aborted || !current()) return;
      if (result.status === 401 || result.status === 403) {
        setView({ phase: "denied", draft: initial(id) }); return;
      }
      if (result.status !== 200 || !cacheSafe(result.headers)) throw Error("UNSAFE_READ");
      const parsed = envelope.parse(result.body).data;
      if (parsed.id !== id) throw Error("FOREIGN_ARTICLE");
      setView({ phase: "ready", draft: parsed });
    }).catch(() => {
      if (live && !controller.signal.aborted && current())
        setView({ phase: "error", draft: initial(id) });
    });
    return () => { live = false; controller.abort(); };
  }, [allowed, api, id, current, read, retry]);
  function setDraft(patch: Partial<Article>) {
    setView(old => old.phase === "ready" ? {
      ...old, draft: { ...old.draft, ...patch },
    } : old);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!allowed || !current() || busyRef.current || !id || view.phase !== "ready")
      return;
    const draft = view.draft;
    if (!draft.title.trim() || !draft.content.trim() ||
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(draft.slug) ||
      (draft.visibility === "PAID" && !draft.description.trim())) {
      setMessage("Проверьте заголовок, содержание, slug и описание платной статьи.");
      return;
    }
    busyRef.current = true; setBusy(true); setMessage("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const payload = {
        title: draft.title, contentType: draft.contentType, content: draft.content,
        visibility: draft.visibility, videoUrl: draft.videoUrl || null,
        logoImg: draft.logoImg, imageUrls: draft.imageUrls,
        slug: draft.slug, description: draft.description,
      };
      const response = await p.articleWriteTransport!({
        method: "PUT", path: api, body: payload, signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status === 401 || response.status === 403) {
        setView({ phase: "denied", draft: initial(id) }); return;
      }
      if (response.status !== 200 || !cacheSafe(response.headers) ||
        !response.body || typeof response.body !== "object" ||
        !("success" in response.body) || response.body.success !== true)
        throw Error("UPDATE_NOT_CONFIRMED");
      const readback = await p.articleReadTransport!(api, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (readback.status !== 200 || !cacheSafe(readback.headers))
        throw Error("READBACK_FAILED");
      const actual = envelope.parse(readback.body).data;
      if (actual.id !== id || actual.title !== draft.title ||
        actual.slug !== draft.slug || actual.visibility !== draft.visibility)
        throw Error("READBACK_MISMATCH");
      setView({ phase: "ready", draft: actual });
      setMessage("Изменения подтверждены сервером.");
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Сохранение не подтверждено. Проверьте данные перед повторением.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setBusy(false);
    }
  }
  async function remove() {
    if (!allowed || !current() || busyRef.current || !id || view.phase !== "ready")
      return;
    if (!window.confirm("Удалить статью «" + view.draft.title + "»?")) return;
    busyRef.current = true; setBusy(true); setMessage("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await p.articleWriteTransport!({
        method: "DELETE", path: api, signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status !== 200 || !cacheSafe(response.headers) ||
        !response.body || typeof response.body !== "object" ||
        !("success" in response.body) || response.body.success !== true)
        throw Error("DELETE_NOT_CONFIRMED");
      const readback = await p.articleReadTransport!(api, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (readback.status !== 404 || !cacheSafe(readback.headers))
        throw Error("DELETE_READBACK_MISMATCH");
      setView({ phase: "deleted", draft: initial(id) });
      setMessage("Удаление статьи подтверждено сервером.");
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Удаление не подтверждено. Проверьте список статей.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setBusy(false);
    }
  }
  if (!allowed) return <main role="alert">Редактор статей недоступен</main>;
  if (view.phase === "loading") return <main role="status">Загрузка статьи…</main>;
  if (view.phase === "error") return <main><p role="alert">Ошибка загрузки статьи</p>
    <button onClick={() => setRetry(n => n + 1)} type="button">Повторить</button></main>;
  if (view.phase === "denied") return <main role="alert">Доступ к статье запрещён</main>;
  if (view.phase === "deleted") return <main><p role="status">{message}</p>
    <a href="/main-panel/articles">К списку статей</a></main>;
  const article = view.draft;
  return <TrainerFormPage title="Редактирование статьи"
    subtitle="Измените содержимое, настройки доступа и медиафайлы"
    backHref="/articles" backLabel="К списку статей">
    <form onSubmit={event => void save(event)}>
      <TrainerFormSection title="Основная информация">
        <label>Название *
          <input required maxLength={500} value={article.title} disabled={busy}
            onChange={event => setDraft({ title: event.target.value })} />
        </label>
        <label>Slug *
          <input required maxLength={100} value={article.slug} disabled={busy}
            pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
            onChange={event => setDraft({ slug: event.target.value })} />
        </label>
        <label>Формат содержимого
          <select value={article.contentType} disabled={busy}
            onChange={event => setDraft({ contentType: event.target.value as Article["contentType"] })}>
            <option value="HTML">HTML</option>
            <option value="TEXT">Текст (Markdown)</option>
          </select>
        </label>
        {article.contentType === "TEXT"
          ? <TrainerMarkdownEditor label="Содержание" required value={article.content}
              disabled={busy} rows={14}
              onChange={value => setDraft({ content: value })} />
          : <label>Содержание *
              <textarea required maxLength={2_000_000} rows={14} value={article.content}
                disabled={busy} onChange={event => setDraft({ content: event.target.value })} />
            </label>}
      </TrainerFormSection>

      <TrainerFormSection title="Доступ к статье">
        <label>Видимость
          <select value={article.visibility} disabled={busy}
            onChange={event => setDraft({ visibility: event.target.value as Article["visibility"] })}>
            <option value="PUBLIC">Публичная</option>
            <option value="PAID">Для подписчиков</option>
          </select>
        </label>
        <label>Описание {article.visibility === "PAID" ? "*" : ""}
          <textarea maxLength={5000} rows={4} value={article.description} disabled={busy}
            required={article.visibility === "PAID"}
            onChange={event => setDraft({ description: event.target.value })} />
        </label>
      </TrainerFormSection>

      <TrainerFormSection title="Медиа">
        <label>URL видео
          <input type="url" value={article.videoUrl ?? ""} maxLength={2000}
            disabled={busy} onChange={event => setDraft({ videoUrl: event.target.value || null })} />
        </label>
        <label>URL обложки
          <input type="url" value={article.logoImg} maxLength={2000}
            disabled={busy} onChange={event => setDraft({ logoImg: event.target.value })} />
        </label>
        {article.logoImg.startsWith("https://") && <img
          className="trainer-course-cover-preview" src={article.logoImg}
          alt="Предпросмотр обложки статьи" referrerPolicy="no-referrer" />}
        <TrainerMediaUrls label="Дополнительные изображения" max={20}
          value={article.imageUrls} disabled={busy}
          onChange={urls => setDraft({ imageUrls: urls })} />
      </TrainerFormSection>

      <TrainerFormActions>
        <a className="trainer-form-back" href="/articles">Отмена</a>
        <button type="submit" disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</button>
      </TrainerFormActions>
    </form>
    <button className="trainer-button-danger" type="button" disabled={busy}
      onClick={() => void remove()}>Удалить статью</button>
    {message && <p role="status">{message}</p>}
  </TrainerFormPage>;
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";
import { readVisibleSteps, type VisibleStepDto } from "./tr013VisibleStepsRead20261022";

const stepSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(),
  type: z.enum(["TRAINING", "EXAMINATION", "THEORY", "BREAK", "PRACTICE", "DIARY", "SURVEY"]),
  durationSec: z.number().nullable().optional(),
  estimatedDurationSec: z.number().nullable(),
  videoUrl: z.string().nullable(), imageUrls: z.array(z.string()),
  pdfUrls: z.array(z.string()), checklist: z.array(z.unknown()),
  requiresVideoReport: z.boolean(), requiresWrittenFeedback: z.boolean(),
  hasTestQuestions: z.boolean(), isDailyCourse: z.boolean(), surveySlug: z.string().nullable(),
});
const daySchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), type: z.string(),
  equipment: z.string(), showCoursePathExport: z.boolean(),
  shareProgressAcrossCourses: z.boolean(), stepIds: z.array(z.string()),
});
type Draft = z.infer<typeof stepSchema> | z.infer<typeof daySchema>;
type Kind = "step" | "day";
const pathMatch = /^\/main-panel\/(steps|days)\/([a-zA-Z0-9_-]{1,128})\/edit\/?$/;
const safeCache = (headers: Record<string, string>) => {
  const values = (headers["cache-control"] ?? "").toLowerCase().split(",")
    .map(x => x.trim());
  return values.includes("private") && values.includes("no-store") && !values.includes("public");
};
export type TrainerContentWriteTransport = (req: {
  method: "PUT" | "DELETE"; path: string; body?: unknown; signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export function TrainerContentEditorRoute(p: {
  pathname: string; actor: PanelActor; token: string | null; authEpoch?: string;
  enabled?: boolean; contentReadTransport?: NotesReadTransport;
  contentWriteTransport?: TrainerContentWriteTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}) {
  const parsedPath = pathMatch.exec(p.pathname);
  const kind: Kind | null = parsedPath?.[1] === "steps" ? "step" :
    parsedPath?.[1] === "days" ? "day" : null;
  const id = parsedPath?.[2] ?? null;
  const [state, setState] = useState<{
    phase: "loading" | "ready" | "error" | "denied" | "deleted";
    draft: Draft | null;
  }>({ phase: "loading", draft: null });
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [checklistText, setChecklistText] = useState("[]");
  const [available, setAvailable] = useState<{
    phase: "idle" | "loading" | "ready" | "error"; steps: VisibleStepDto[];
  }>({ phase: "idle", steps: [] });
  const availabilityRef = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const getCurrentRef = useRef(p.getCurrentSession);
  getCurrentRef.current = p.getCurrentSession;
  const actorId = p.actor.id, role = p.actor.role, token = p.token, epoch = p.authEpoch;
  const current = useCallback(() => {
    const live = getCurrentRef.current?.();
    return !!live && live.actor.id === actorId && live.actor.role === role &&
      live.authEpoch === epoch && live.token === token;
  }, [actorId, role, epoch, token]);
  const allowed = !!kind && !!id && !!p.enabled && !!token && !!epoch &&
    (role === "TRAINER" || role === "ADMIN") && current() &&
    !!p.contentReadTransport && !!p.contentWriteTransport;
  const api = id && kind ? "/api/v1/trainer/" +
    (kind === "step" ? "steps" : "days") + "/manage/" + encodeURIComponent(id) : "";
  const reader = p.contentReadTransport;
  useEffect(() => {
    const ref = abortRef;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ref.current?.abort();
      availabilityRef.current?.abort();
    };
  }, [actorId, role, token, epoch, api]);
  useEffect(() => {
    if (!allowed || !reader || !kind || !id) return;
    let live = true;
    const ac = new AbortController();
    setState({ phase: "loading", draft: null });
    setMessage("");
    void reader(api, ac.signal).then(result => {
      if (!live || ac.signal.aborted || !current()) return;
      if (result.status === 401 || result.status === 403) {
        setState({ phase: "denied", draft: null }); return;
      }
      if (result.status !== 200 || !safeCache(result.headers))
        throw Error("INVALID_CONTENT_READ");
      const body: unknown = result.body;
      const response = z.object({ success: z.literal(true), data:
        kind === "step" ? stepSchema : daySchema }).parse(body);
      if (response.data.id !== id) throw Error("FOREIGN_CONTENT");
      setState({ phase: "ready", draft: response.data });
      if (kind === "step" && "checklist" in response.data)
        setChecklistText(JSON.stringify(response.data.checklist, null, 2));
    }).catch(() => {
      if (live && !ac.signal.aborted && current())
        setState({ phase: "error", draft: null });
    });
    return () => { live = false; ac.abort(); };
  }, [api, allowed, reader, current, kind, id, refresh]);
  const setField = (name: string, value: unknown) => setState(old =>
    old.phase === "ready" && old.draft
      ? { ...old, draft: { ...old.draft, [name]: value } as Draft } : old);
  async function mutate(method: "PUT" | "DELETE", body?: Record<string, unknown>) {
    if (!allowed || !current() || state.phase !== "ready" || savingRef.current)
      return;
    const before = state.draft;
    savingRef.current = true; setSaving(true); setMessage("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await p.contentWriteTransport!({
        method, path: api, body, signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status === 401 || response.status === 403) {
        setState({ phase: "denied", draft: null }); return;
      }
      if (response.status !== 200 || !safeCache(response.headers) ||
        !response.body || typeof response.body !== "object" ||
        !("success" in response.body) || response.body.success !== true)
        throw Error("WRITE_NOT_CONFIRMED");
      const again = await p.contentReadTransport!(api, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (!safeCache(again.headers)) throw Error("UNSAFE_READBACK");
      if (method === "DELETE") {
        if (again.status !== 404) throw Error("DELETE_NOT_CONFIRMED");
        setState({ phase: "deleted", draft: null });
        setMessage("Удаление подтверждено сервером.");
      } else {
        if (again.status !== 200) throw Error("UPDATE_NOT_CONFIRMED");
        const data = z.object({ success: z.literal(true), data:
          kind === "step" ? stepSchema : daySchema }).parse(again.body).data;
        if (data.id !== id || data.title !== before?.title ||
          data.description !== before.description)
          throw Error("CONTENT_MISMATCH");
        setState({ phase: "ready", draft: data });
        setMessage("Основные поля подтверждены повторным чтением сервера.");
      }
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Операция не подтверждена. Обновите материал перед повторением.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      savingRef.current = false;
      if (mountedRef.current && current()) setSaving(false);
    }
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowed || !state.draft || !kind || savingRef.current) return;
    const draft = state.draft;
    let checkedDraft: Draft = draft;
    if (kind === "step") {
      try {
        const checklist: unknown = JSON.parse(checklistText);
        if (!Array.isArray(checklist)) throw Error("NOT_ARRAY");
        checkedDraft = { ...draft, checklist } as Draft;
      } catch { setMessage("Проверьте JSON-массив вопросов."); return; }
    }
    if (!draft.title.trim()) {
      setMessage("Название обязательно."); return;
    }
    const data = kind === "step"
      ? stepSchema.safeParse(checkedDraft) : daySchema.safeParse(checkedDraft);
    if (!data.success) { setMessage("Проверьте поля материала."); return; }
    const body = { ...data.data } as Record<string, unknown>;
    delete body.id;
    if (kind === "step" && body.durationSec === undefined) body.durationSec = null;
    void mutate("PUT", body);
  };
  const remove = () => {
    if (!allowed || !current() || !state.draft || savingRef.current) return;
    if (!window.confirm("Удалить «" + state.draft.title + "»? Удаление необратимо."))
      return;
    void mutate("DELETE");
  };
  async function loadAvailableSteps() {
    if (!allowed || !current() || kind !== "day" || available.phase === "loading" ||
      !p.contentReadTransport) return;
    availabilityRef.current?.abort();
    const ctl = new AbortController();
    availabilityRef.current = ctl;
    setAvailable({ phase: "loading", steps: [] });
    try {
      const rows = await readVisibleSteps({
        actor: p.actor, enabled: true, isDailyCourse: false,
        signal: ctl.signal, isCurrent: current,
        transport: req => p.contentReadTransport!(req.path, req.signal),
      });
      if (!ctl.signal.aborted && mountedRef.current && current())
        setAvailable({ phase: "ready", steps: rows });
    } catch {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setAvailable({ phase: "error", steps: [] });
    } finally {
      if (availabilityRef.current === ctl) availabilityRef.current = null;
    }
  }
  const daySelected = state.draft && "stepIds" in state.draft
    ? state.draft.stepIds : [];
  function selectDayStep(id: string, yes: boolean) {
    if (!allowed || !current()) return;
    setField("stepIds", yes ? [...new Set([...daySelected, id])] :
      daySelected.filter(item => item !== id));
  }
  function moveDayStep(id: string, delta: number) {
    if (!allowed || !current()) return;
    const next = [...daySelected];
    const pos = next.indexOf(id);
    if (pos < 0 || pos + delta < 0 || pos + delta >= next.length) return;
    [next[pos], next[pos + delta]] = [next[pos + delta]!, next[pos]!];
    setField("stepIds", next);
  }
  const str = (name: string) => String(
    state.draft ? (state.draft as unknown as Record<string, unknown>)[name] ?? "" : "",
  );
  const bool = (name: string) => Boolean(state.draft &&
    (state.draft as unknown as Record<string, unknown>)[name]);
  const text = (field: string, label: string, multiline = false) =>
    <label key={field}>{label}
      {multiline
        ? <textarea disabled={saving} value={str(field)}
          onChange={e => setField(field, e.target.value)} />
        : <input disabled={saving} value={str(field)}
          onChange={e => setField(field, e.target.value)} />}
    </label>;
  const checkbox = (field: string, label: string) => <label key={field}>
    <input type="checkbox" checked={bool(field)} disabled={saving}
      onChange={e => setField(field, e.target.checked)} />{label}</label>;
  const number = (field: string, label: string) => <label key={field}>{label}
    <input type="number" min={1} value={str(field)} disabled={saving}
      onChange={e => setField(field, e.target.value === "" ? null : Number(e.target.value))} />
  </label>;
  const urls = (field: "imageUrls" | "pdfUrls" | "stepIds", label: string) =>
    <label key={field}>{label}
      <textarea disabled={saving} value={
        state.draft
          ? ((state.draft as unknown as Record<string, unknown>)[field] as string[] | undefined)
            ?.join("\n") ?? ""
          : ""
      } onChange={e => setField(field, e.target.value.split("\n")
        .map(x => x.trim()).filter(Boolean))} />
    </label>;
  if (!allowed) return <main role="alert">Редактирование материала недоступно</main>;
  if (state.phase === "loading") return <main role="status">Загрузка материала…</main>;
  if (state.phase === "denied") return <main role="alert">Нет доступа к материалу</main>;
  if (state.phase === "error") return <main><p role="alert">Ошибка чтения</p>
    <button type="button" onClick={() => setRefresh(x => x + 1)}>Повторить</button>
  </main>;
  const listPath = kind === "step" ? "/main-panel/steps" : "/main-panel/days";
  if (state.phase === "deleted") return <main><p role="status">{message}</p>
    <a href={listPath}>К списку</a></main>;
  return <main><h1>Редактирование {kind === "step" ? "шага" : "дня"}</h1>
    <p><a href={listPath}>Назад к списку</a></p>
    <form onSubmit={save}>
      {text("title", "Название *")}
      {text("description", "Описание", true)}
      {kind === "day" ? <>
        {text("type", "Тип дня")}
        {text("equipment", "Оборудование")}
        {checkbox("showCoursePathExport", "Показывать путь курса")}
        {checkbox("shareProgressAcrossCourses", "Общий прогресс между курсами")}
        <fieldset><legend>Состав дня</legend>
          <button type="button" disabled={available.phase === "loading" || saving}
            onClick={() => void loadAvailableSteps()}>Показать доступные шаги</button>
          {available.phase === "loading" && <p role="status">Загрузка шагов…</p>}
          {available.phase === "error" && <p role="alert">Не удалось загрузить список шагов</p>}
          {available.phase === "ready" && <>
            <ul>{available.steps.map(row => <li key={row.id}>
              <label><input type="checkbox" disabled={saving}
                checked={daySelected.includes(row.id)}
                onChange={e => selectDayStep(row.id, e.target.checked)} />
                {row.title}</label>
            </li>)}</ul>
          </>}
          <ol>{daySelected.map((stepId, index) => <li key={stepId}>
            {available.steps.find(row => row.id === stepId)?.title ?? stepId}
            <button type="button" disabled={saving || index === 0}
              onClick={() => moveDayStep(stepId, -1)}>Вверх</button>
            <button type="button" disabled={saving || index === daySelected.length - 1}
              onClick={() => moveDayStep(stepId, 1)}>Вниз</button>
            <button type="button" disabled={saving}
              onClick={() => selectDayStep(stepId, false)}>Исключить</button>
          </li>)}</ol>
          {urls("stepIds", "ID шагов в порядке выполнения (по одному на строку)")}
        </fieldset>
      </> : <>
        <label>Тип шага
          <select value={str("type")} disabled={saving}
            onChange={e => setField("type", e.target.value)}>
            {["TRAINING", "EXAMINATION", "THEORY", "BREAK", "PRACTICE", "DIARY", "SURVEY"]
              .map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        {number("durationSec", "Таймер (секунды)")}
        {number("estimatedDurationSec", "Оценочная длительность (секунды)")}
        {text("videoUrl", "URL видео")}
        {urls("imageUrls", "URL изображений (по одному в строке)")}
        {urls("pdfUrls", "URL PDF (по одному в строке)")}
        {checkbox("requiresVideoReport", "Видеоотчёт")}
        {checkbox("requiresWrittenFeedback", "Письменный отчёт")}
        {checkbox("hasTestQuestions", "Тестовые вопросы")}
        {checkbox("isDailyCourse", "Курс дня")}
        {text("surveySlug", "Анкета (slug)")}
        <label>Вопросы теста (JSON-массив)
          <textarea value={checklistText} disabled={saving}
            onChange={e => setChecklistText(e.target.value)} />
        </label>
      </>}
      <button type="submit" disabled={saving}>Сохранить</button>
      <button type="button" disabled={saving} onClick={remove}>Удалить</button>
    </form>
    {message && <p role="status">{message}</p>}
  </main>;
}

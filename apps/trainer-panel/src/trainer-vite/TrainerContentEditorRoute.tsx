import { TrainerVideoSelector } from "./TrainerVideoSelector";
import type { VideoMetadataTransport } from "./TrainerVideosMetadataRead20261022";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  TrainerFormPage, TrainerFormSection, TrainerFormActions, TrainerMarkdownEditor,
  TrainerMediaUrls, TrainerExamQuestions, type TrainerQuestion, trainerSurveyChoices,
} from "./live/TrainerFormUI";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";
import { readVisibleSteps, type VisibleStepDto } from "./tr013VisibleStepsRead20261022";
import { TrainerCourseDayPicker } from "./live/TrainerCourseDayPicker";

const stepSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(),
  type: z.enum(["TRAINING", "EXAMINATION", "THEORY", "BREAK", "PRACTICE", "DIARY", "SURVEY"]),
  durationSec: z.number().nullable().optional(),
  estimatedDurationSec: z.number().nullable(),
  videoUrl: z.string().nullable(), videoUrls: z.array(z.string()).optional(),
  imageUrls: z.array(z.string()),
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
  videoMetadataTransport?: VideoMetadataTransport;
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
  const [availableRetry, setAvailableRetry] = useState(0);
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
  // Same auto-loading behaviour as the course editor; requests retain the
  // actor/session scope, and every retry cancels the previous response.
  useEffect(() => {
    if (!allowed || kind !== "day" || !reader ||
        (role !== "TRAINER" && role !== "ADMIN")) return;
    const ctl = new AbortController();
    availabilityRef.current?.abort();
    availabilityRef.current = ctl;
    setAvailable({ phase: "loading", steps: [] });
    void readVisibleSteps({
      enabled: true, actor: { id: actorId, role }, isDailyCourse: false,
      signal: ctl.signal, isCurrent: current,
      transport: req => reader(req.path, req.signal),
    }).then(rows => {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setAvailable({ phase: "ready", steps: rows });
    }).catch(() => {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setAvailable({ phase: "error", steps: [] });
    });
    return () => {
      ctl.abort();
      if (availabilityRef.current === ctl) availabilityRef.current = null;
    };
  }, [allowed, kind, reader, role, actorId, current, availableRetry]);
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
          data.description !== before.description ||
          (kind === "step" && before && "videoUrl" in before &&
            "videoUrl" in data && (
              data.videoUrl !== before.videoUrl ||
              JSON.stringify(data.videoUrls ?? (data.videoUrl ? [data.videoUrl] : [])) !==
              JSON.stringify(before.videoUrls ?? (before.videoUrl ? [before.videoUrl] : []))
            )) ||
          (kind === "day" && "stepIds" in data && before &&
            "stepIds" in before && (data.stepIds.length !== before.stepIds.length ||
              data.stepIds.some((stepId, index) => stepId !== before.stepIds[index]))))
          throw Error("CONTENT_MISMATCH");
        setState({ phase: "ready", draft: data });
        setMessage(kind === "day"
          ? "Основные поля и порядок шагов подтверждены повторным чтением сервера."
          : "Основные поля подтверждены повторным чтением сервера.");
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
  const daySelected = state.draft && "stepIds" in state.draft
    ? state.draft.stepIds : [];
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
  const originalQuestions = (() => {
    try {
      const parsed: unknown = JSON.parse(checklistText);
      if (Array.isArray(parsed) && parsed.every(row => row && typeof row === "object" &&
        typeof row.id === "string" && typeof row.question === "string" &&
        Array.isArray(row.options) && row.options.every((option: unknown) => typeof option === "string") &&
        typeof row.correctAnswer === "number")) return parsed as TrainerQuestion[];
    } catch { /* malformed historic JSON is retained in the fallback editor */ }
    return null;
  })();
  const stepMedia = (name: "imageUrls" | "pdfUrls"): string[] => {
    if (!state.draft || !("imageUrls" in state.draft)) return [];
    const row = state.draft[name];
    return Array.isArray(row) ? row : [];
  };
  return <TrainerFormPage
    title={kind === "step" ? "Редактирование шага" : "Редактирование дня"}
    subtitle="Обновите содержимое и сохраните изменения"
    backHref={kind === "step" ? "/steps" : "/days"}>
    <form onSubmit={save}>
      <TrainerFormSection title="Основная информация">
        {text("title", "Название *")}
        {kind === "day" && <>
          <label>Тип дня
            <select value={str("type")} disabled={saving}
              onChange={event => setField("type", event.target.value)}>
              {([
                ["regular", "Тренировочный день"], ["introduction", "Вводный блок"],
                ["instructions", "Инструкции"], ["diagnostics", "Диагностика"],
                ["summary", "Подведение итогов"],
              ] as const).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {text("equipment", "Необходимое оборудование")}
          {checkbox("showCoursePathExport", "Показывать путь курса")}
          {checkbox("shareProgressAcrossCourses", "Общий прогресс между курсами")}
        </>}
        {kind === "step" && <label>Тип шага
          <select value={str("type")} disabled={saving}
            onChange={event => setField("type", event.target.value)}>
            {([
              ["TRAINING", "Тренировочный"], ["EXAMINATION", "Экзаменационный"],
              ["THEORY", "Теоретический"], ["BREAK", "Перерыв"],
              ["PRACTICE", "Тренировка без таймера"], ["DIARY", "Дневник"],
              ["SURVEY", "Анкета"],
            ] as const).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
        <TrainerMarkdownEditor label="Описание" value={str("description")}
          onChange={value => setField("description", value)} disabled={saving} />
      </TrainerFormSection>

      {kind === "day" ? <TrainerFormSection title="Состав дня"
        hint="Выберите шаги и установите порядок прохождения.">
        {available.phase === "loading" && <p role="status">Загрузка шагов…</p>}
        {available.phase === "error" && <p role="alert">Не удалось загрузить список шагов.
          <button type="button" className="trainer-button-secondary" disabled={saving}
            onClick={() => setAvailableRetry(count => count + 1)}>Повторить</button>
        </p>}
        <TrainerCourseDayPicker kind="step" available={available.steps.map(row => ({
          id: row.id, title: row.title,
        }))} selectedIds={daySelected} disabled={saving || available.phase !== "ready"}
          onChange={ids => setField("stepIds", ids)} />
        <details><summary>Редактировать ID шагов вручную</summary>
          {urls("stepIds", "ID шагов в порядке выполнения (по одному на строку)")}
        </details>
      </TrainerFormSection> : <>
        <TrainerFormSection title="Время выполнения">
          {number("durationSec", "Таймер (секунды)")}
          {number("estimatedDurationSec", "Примерная длительность (секунды)")}
        </TrainerFormSection>
        <TrainerFormSection title="Медиа">
          <TrainerVideoSelector values={state.draft && "videoUrl" in state.draft ?
            state.draft.videoUrls ?? (state.draft.videoUrl ? [state.draft.videoUrl] : []) : []}
            onChangeValues={urls => setState(previous => previous.phase === "ready" &&
              previous.draft && "videoUrl" in previous.draft ? {
                ...previous,
                draft: { ...previous.draft, videoUrl: urls[0] ?? null, videoUrls: urls },
              } : previous)}
            disabled={saving} actor={p.actor} token={p.token} authEpoch={p.authEpoch}
            getCurrentSession={p.getCurrentSession}
            videoMetadataTransport={p.videoMetadataTransport} />
          <TrainerMediaUrls label="Изображения" value={stepMedia("imageUrls")}
            onChange={value => setField("imageUrls", value)} disabled={saving} max={10} />
          <TrainerMediaUrls label="PDF-материалы" kind="pdf" value={stepMedia("pdfUrls")}
            onChange={value => setField("pdfUrls", value)} disabled={saving} max={10} />
        </TrainerFormSection>
        <TrainerFormSection title="Настройки шага">
          {checkbox("isDailyCourse", "Для курса дня")}
          {str("type") === "SURVEY" && <label>Шаблон анкеты *
            <select value={str("surveySlug")} disabled={saving}
              onChange={event => setField("surveySlug", event.target.value)}>
              <option value="">Выберите анкету</option>
              {trainerSurveyChoices.map(({ value, label }) =>
                <option value={value} key={value}>{label}</option>)}
              {str("surveySlug") && !trainerSurveyChoices.some(row => row.value === str("surveySlug")) &&
                <option value={str("surveySlug")}>Исторический шаблон: {str("surveySlug")}</option>}
            </select>
          </label>}
          {str("type") === "EXAMINATION" && <>
            {checkbox("requiresVideoReport", "Видеоотчёт")}
            {checkbox("requiresWrittenFeedback", "Письменная обратная связь")}
            {checkbox("hasTestQuestions", "Тестовые вопросы")}
            {bool("hasTestQuestions") && (originalQuestions
              ? <TrainerExamQuestions value={originalQuestions}
                  onChange={questions => setChecklistText(JSON.stringify(questions))}
                  disabled={saving} />
              : <label>Вопросы теста (JSON-массив)
                  <textarea value={checklistText} disabled={saving}
                    onChange={event => setChecklistText(event.target.value)} />
                </label>)}
          </>}
        </TrainerFormSection>
      </>}
      <TrainerFormActions>
        <a className="trainer-form-back" href={kind === "step" ? "/steps" : "/days"}>Отмена</a>
        <button type="submit" disabled={saving}>Сохранить</button>
      </TrainerFormActions>
    </form>
    <button className="trainer-button-danger" type="button" disabled={saving}
      onClick={remove}>Удалить</button>
    {message && <p role="status">{message}</p>}
  </TrainerFormPage>;
}

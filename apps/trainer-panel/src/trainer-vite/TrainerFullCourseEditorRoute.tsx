import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";
import { readVisibleDays, type VisibleDay } from "./trainerVisibleDaysRead20261022";
import { TrainerCourseDayPicker } from "./live/TrainerCourseDayPicker";
import {
  TrainerFormPage, TrainerFormSection, TrainerFormActions, TrainerMarkdownEditor,
} from "./live/TrainerFormUI";
import {
  parseVersionedCourseEditorSnapshot, type VersionedCourseEditorSnapshot,
} from "./trainerCourseDraftReadContract";

type Draft = {
  name: string; guideContent: string; shortDesc: string; description: string;
  duration: string; videoUrl: string; logoImg: string;
  isPublic: boolean; isPaid: boolean; showInProfile: boolean;
  isPersonalized: boolean; trainingDays: string[]; allowedUsers: string[];
  equipment: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
};
const path = /^\/main-panel\/courses\/([A-Za-z0-9_-]{1,128})\/edit\/?$/;
const defaultDraft: Draft = {
  name: "", guideContent: "", shortDesc: "", description: "", duration: "",
  videoUrl: "", logoImg: "", isPublic: true, isPaid: false,
  showInProfile: true, isPersonalized: false, trainingDays: [],
  allowedUsers: [], equipment: "", trainingLevel: "BEGINNER",
};
const privateResponse = (h: Record<string, string>) => {
  const directives = (h["cache-control"] ?? "").toLowerCase().split(",").map(x => x.trim());
  return directives.includes("private") && directives.includes("no-store") &&
    !directives.includes("public");
};
const form = (snapshot: VersionedCourseEditorSnapshot): Draft => ({
  name: snapshot.name, guideContent: snapshot.guideContent ?? "",
  shortDesc: snapshot.shortDesc, description: snapshot.description,
  duration: snapshot.duration, videoUrl: snapshot.videoUrl ?? "",
  logoImg: snapshot.logoImg, isPublic: !snapshot.isPrivate, isPaid: snapshot.isPaid,
  showInProfile: snapshot.showInProfile, isPersonalized: snapshot.isPersonalized,
  trainingDays: snapshot.dayLinks.map(link => link.dayId),
  allowedUsers: snapshot.access.map(link => link.userId),
  equipment: snapshot.equipment, trainingLevel: snapshot.trainingLevel,
});
export type TrainerFullCourseWriteTransport = (req: {
  method: "PUT" | "POST" | "DELETE"; path: string; body: unknown; signal: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
const created = z.object({
  success: z.literal(true), data: z.object({
    id: z.string().uuid(),
  }).strict(),
}).strict();
const saved = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string(), version: z.number().int().positive() }).strict(),
}).strict();
const sameStrings = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, index) => v === b[index]);
const sameUnordered = (a: string[], b: string[]) =>
  sameStrings([...a].sort(), [...b].sort());

export function TrainerFullCourseEditorRoute(p: {
  pathname: string; actor: PanelActor; token: string | null; authEpoch?: string;
  enabled?: boolean; courseReadTransport?: NotesReadTransport;
  courseWriteTransport?: TrainerFullCourseWriteTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}) {
  const isCreate = p.pathname === "/main-panel/courses/new";
  const courseId = path.exec(p.pathname)?.[1] ?? null;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [view, setView] = useState<{
    phase: "loading" | "ready" | "error" | "denied" | "conflict" | "created" | "deleted";
    snapshot: VersionedCourseEditorSnapshot | null; draft: Draft | null;
  }>({ phase: isCreate ? "ready" : "loading", snapshot: null,
    draft: isCreate ? { ...defaultDraft } : null });
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [availableDays, setAvailableDays] = useState<{
    phase: "idle" | "loading" | "ready" | "error"; data: VisibleDay[];
  }>({ phase: "idle", data: [] });
  const [studentQuery, setStudentQuery] = useState("");
  const [studentSearch, setStudentSearch] = useState<{
    phase: "idle" | "loading" | "ready" | "error";
    data: { id: string; username: string }[];
  }>({ phase: "idle", data: [] });
  const [studentLabels, setStudentLabels] = useState<Record<string, string>>({});
  const dayRef = useRef<AbortController | null>(null);
  const studentRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const writerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(p.getCurrentSession);
  sessionRef.current = p.getCurrentSession;
  const actorId = p.actor.id, role = p.actor.role, token = p.token, epoch = p.authEpoch;
  const current = useCallback(() => {
    const s = sessionRef.current?.();
    return !!s && s.actor.id === actorId && s.actor.role === role &&
      s.token === token && s.authEpoch === epoch;
  }, [actorId, role, token, epoch]);
  const enabled = p.enabled === true && (isCreate || !!courseId) && !!token && !!epoch &&
    (role === "TRAINER" || role === "ADMIN") && current() &&
    !!p.courseReadTransport && !!p.courseWriteTransport;
  const readPath = courseId
    ? "/api/v1/trainer/courses/" + encodeURIComponent(courseId) + "/editor-snapshot" : "";
  const savePath = courseId
    ? "/api/v1/trainer/courses/manage/" + encodeURIComponent(courseId)
    : "/api/v1/trainer/courses/manage";
  const reader = p.courseReadTransport;
  useEffect(() => {
    const active = writerRef;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      active.current?.abort();
      dayRef.current?.abort();
      studentRef.current?.abort();
    };
  }, [actorId, role, token, epoch, courseId]);
  useEffect(() => {
    if (!enabled || !reader || !courseId || isCreate) return;
    let live = true;
    const controller = new AbortController();
    setView({ phase: "loading", snapshot: null, draft: null });
    setMessage("");
    void reader(readPath, controller.signal).then(response => {
      if (!live || controller.signal.aborted || !current()) return;
      if (response.status === 401 || response.status === 403) {
        setView({ phase: "denied", snapshot: null, draft: null }); return;
      }
      if (response.status !== 200 || !privateResponse(response.headers))
        throw Error("COURSE_SNAPSHOT_FAILED");
      const snapshot = parseVersionedCourseEditorSnapshot(response.body, courseId);
      setView({ phase: "ready", snapshot, draft: form(snapshot) });
      setStudentLabels(Object.fromEntries(
        snapshot.access.map(access => [access.userId, access.user.username]),
      ));
    }).catch(() => {
      if (live && !controller.signal.aborted && current())
        setView({ phase: "error", snapshot: null, draft: null });
    });
    return () => { live = false; controller.abort(); };
  }, [enabled, reader, readPath, courseId, current, retry, isCreate]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setView(old => old.draft && old.phase === "ready"
      ? { ...old, draft: { ...old.draft, [key]: value } } : old);
  }
  async function loadDays() {
    if (!enabled || !current() || !p.courseReadTransport ||
      availableDays.phase === "loading") return;
    dayRef.current?.abort();
    const ctl = new AbortController();
    dayRef.current = ctl;
    setAvailableDays({ phase: "loading", data: [] });
    try {
      const data = await readVisibleDays({
        actorId, role: role as "TRAINER" | "ADMIN",
        transport: p.courseReadTransport, signal: ctl.signal,
        isCurrent: current,
      });
      if (!ctl.signal.aborted && mountedRef.current && current())
        setAvailableDays({ phase: "ready", data });
    } catch {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setAvailableDays({ phase: "error", data: [] });
    } finally {
      if (dayRef.current === ctl) dayRef.current = null;
    }
  }
  useEffect(() => {
    if (!enabled || !reader) return;
    const controller = new AbortController();
    setAvailableDays({ phase: "loading", data: [] });
    void readVisibleDays({
      actorId, role: role as "TRAINER" | "ADMIN",
      transport: reader, signal: controller.signal,
      isCurrent: current,
    }).then(data => {
      if (!controller.signal.aborted && mountedRef.current && current())
        setAvailableDays({ phase: "ready", data });
    }).catch(() => {
      if (!controller.signal.aborted && mountedRef.current && current())
        setAvailableDays({ phase: "error", data: [] });
    });
    return () => controller.abort();
  }, [enabled, reader, actorId, role, epoch, current]);
  async function lookupStudents() {
    const query = studentQuery.trim();
    if (!enabled || !current() || !p.courseReadTransport || query.length < 2 ||
      query.length > 50 || studentSearch.phase === "loading") return;
    studentRef.current?.abort();
    const ctl = new AbortController();
    studentRef.current = ctl;
    setStudentSearch({ phase: "loading", data: [] });
    try {
      const response = await p.courseReadTransport(
        "/api/v1/trainer/notes/manage/lookup?query=" + encodeURIComponent(query),
        ctl.signal,
      );
      if (ctl.signal.aborted || !mountedRef.current || !current()) return;
      if (response.status !== 200 || !privateResponse(response.headers))
        throw Error("LOOKUP_FAILED");
      const data = z.object({ success: z.literal(true), data: z.array(z.object({
        id: z.string(), username: z.string(),
      }).strict()) }).strict().parse(response.body).data;
      setStudentSearch({ phase: "ready", data });
    } catch {
      if (!ctl.signal.aborted && mountedRef.current && current())
        setStudentSearch({ phase: "error", data: [] });
    } finally {
      if (studentRef.current === ctl) studentRef.current = null;
    }
  }
  function chooseStudent(row: { id: string; username: string }) {
    if (!view.draft || !enabled || !current()) return;
    change("allowedUsers", [...new Set([...view.draft.allowedUsers, row.id])]);
    setStudentLabels(previous => ({ ...previous, [row.id]: row.username }));
    setStudentQuery("");
    setStudentSearch({ phase: "idle", data: [] });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busyRef.current || !view.draft ||
      (!isCreate && (!view.snapshot || !courseId)) ||
      view.phase !== "ready" || !current()) return;
    const draft = view.draft;
    if (!draft.name.trim() || !draft.duration.trim() ||
      !/^$|^https:\/\//i.test(draft.logoImg) ||
      new Set(draft.allowedUsers).size !== draft.allowedUsers.length ||
      (draft.isPublic && draft.allowedUsers.length > 0)) {
      setMessage("Проверьте название, длительность, URL обложки и списки ID."); return;
    }
    const expectedVersion = view.snapshot?.version;
    busyRef.current = true; setBusy(true); setMessage("");
    const controller = new AbortController();
    writerRef.current = controller;
    try {
      const body = {
        ...draft, guideContent: draft.guideContent || null,
        videoUrl: draft.videoUrl || null,
        ...(!isCreate ? { expectedVersion } : {}),
      };
      const result = await p.courseWriteTransport!({
        method: isCreate ? "POST" : "PUT", path: savePath, body,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (isCreate) {
        if (result.status === 401 || result.status === 403) {
          setView({ phase: "denied", snapshot: null, draft: null }); return;
        }
        if (result.status !== 201 || !privateResponse(result.headers))
          throw Error("COURSE_CREATE_FAILED");
        const resultId = created.parse(result.body).data.id;
        setCreatedId(resultId);
        setView(old => ({ ...old, phase: "created" }));
        setMessage("Сервер подтвердил создание курса.");
        return;
      }
      if (result.status === 409) {
        setView(old => ({ ...old, phase: "conflict" }));
        setMessage("Конфликт версии. Скопируйте изменения и обновите снимок вручную.");
        return;
      }
      if (result.status === 401 || result.status === 403) {
        setView({ phase: "denied", snapshot: null, draft: null }); return;
      }
      if (result.status !== 200 || !privateResponse(result.headers))
        throw Error("COURSE_SAVE_FAILED");
      const acknowledged = saved.parse(result.body).data;
      if (acknowledged.id !== courseId || acknowledged.version !== (expectedVersion ?? 0) + 1)
        throw Error("INVALID_COURSE_REVISION");
      const second = await p.courseReadTransport!(readPath, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (second.status !== 200 || !privateResponse(second.headers))
        throw Error("COURSE_READBACK_FAILED");
      const actual = parseVersionedCourseEditorSnapshot(second.body, courseId);
      const verified = form(actual);
      if (actual.version !== acknowledged.version ||
        verified.name !== draft.name || verified.shortDesc !== draft.shortDesc ||
        verified.description !== draft.description || verified.duration !== draft.duration ||
        verified.isPublic !== draft.isPublic || verified.isPaid !== draft.isPaid ||
        verified.showInProfile !== draft.showInProfile ||
        verified.isPersonalized !== draft.isPersonalized ||
        verified.logoImg !== draft.logoImg || verified.videoUrl !== draft.videoUrl ||
        verified.equipment !== draft.equipment ||
        verified.trainingLevel !== draft.trainingLevel ||
        !sameStrings(verified.trainingDays, draft.trainingDays) ||
        !sameUnordered(verified.allowedUsers, draft.isPublic ? [] : draft.allowedUsers) ||
        verified.guideContent !== draft.guideContent)
        throw Error("COURSE_READBACK_MISMATCH");
      setView({ phase: "ready", snapshot: actual, draft: verified });
      setMessage("Курс сохранён. Поля и версия подтверждены сервером.");
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Сохранение не подтверждено. Проверьте сервер перед повторной отправкой.");
    } finally {
      if (writerRef.current === controller) writerRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setBusy(false);
    }
  }
  async function remove() {
    if (isCreate || !enabled || !current() || busyRef.current ||
      view.phase !== "ready" || !view.snapshot || !courseId) return;
    if (!window.confirm(
      "Удалить курс «" + view.snapshot.name +
      "» и все связанные записи участников, прогресс и отзывы? Отменить нельзя.",
    )) return;
    busyRef.current = true; setBusy(true); setMessage("");
    const controller = new AbortController();
    writerRef.current = controller;
    try {
      const result = await p.courseWriteTransport!({
        method: "DELETE", path: savePath,
        body: { expectedVersion: view.snapshot.version },
        signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (result.status === 409) {
        setView(old => ({ ...old, phase: "conflict" }));
        setMessage("Курс изменился. Обновите данные перед удалением.");
        return;
      }
      if (result.status === 401 || result.status === 403) {
        setView({ phase: "denied", snapshot: null, draft: null }); return;
      }
      if (result.status !== 200 || !privateResponse(result.headers) ||
        !result.body || typeof result.body !== "object" ||
        !("success" in result.body) || result.body.success !== true)
        throw Error("COURSE_DELETE_NOT_CONFIRMED");
      const again = await p.courseReadTransport!(readPath, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (again.status !== 404 || !privateResponse(again.headers))
        throw Error("COURSE_DELETE_READBACK_MISMATCH");
      setView({ phase: "deleted", draft: null, snapshot: null });
      setMessage("Удаление курса подтверждено сервером.");
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setMessage("Удаление не подтверждено. Проверьте список курсов.");
    } finally {
      if (writerRef.current === controller) writerRef.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setBusy(false);
    }
  }
  if (!enabled) return <main role="alert">Редактор курса недоступен</main>;
  if (view.phase === "loading") return <main role="status">Загрузка снимка курса…</main>;
  if (view.phase === "error") return <main><p role="alert">Не удалось загрузить курс</p>
    <button type="button" onClick={() => setRetry(x => x + 1)}>Повторить</button>
  </main>;
  if (view.phase === "denied") return <main role="alert">Доступ к курсу запрещён</main>;
  if (view.phase === "deleted") return <main><h1>Курс удалён</h1>
    <p role="status">{message}</p><a href="/main-panel">К списку курсов</a>
  </main>;
  if (view.phase === "created") return <main><h1>Курс создан</h1>
    <p role="status">{message}</p>
    {createdId && <a href={"/main-panel/courses/" +
      encodeURIComponent(createdId) + "/edit"}>Редактировать созданный курс</a>}
  </main>;
  const draft = view.draft;
  if (!draft) return <main role="alert">Снимок курса отсутствует</main>;
  const field = (key: keyof Draft, label: string, multi = false) =>
    <label key={key}>{label}
      {multi ? <textarea value={String(draft[key] ?? "")} disabled={busy || view.phase === "conflict"}
        onChange={e => change(key, e.target.value as never)} />
        : <input value={String(draft[key] ?? "")} disabled={busy || view.phase === "conflict"}
          onChange={e => change(key, e.target.value as never)} />}
    </label>;
  const checkbox = (key: "isPublic" | "isPaid" | "showInProfile" | "isPersonalized",
    label: string) => <label className="trainer-option" key={key}>
    <input type="checkbox" checked={draft[key]} disabled={busy || view.phase === "conflict"}
      onChange={e => change(key, e.target.checked)} />{label}
  </label>;
  const list = (key: "trainingDays" | "allowedUsers", label: string) =>
    <label key={key}>{label}
      <textarea value={draft[key].join("\n")} disabled={busy || view.phase === "conflict"}
        onChange={e => change(key, e.target.value.split("\n")
          .map(s => s.trim()).filter(Boolean))} />
    </label>;
  const accessMode = draft.isPaid ? "paid" : draft.isPublic ? "public" : "private";
  const setAccessMode = (mode: "public" | "private" | "paid") => {
    change("isPublic", mode !== "private");
    change("isPaid", mode === "paid");
    if (mode !== "private") change("allowedUsers", []);
  };
  return <TrainerFormPage title={isCreate ? "Создание нового курса" : "Редактирование курса"}
    subtitle="Заполните информацию о курсе, настройте доступ и состав тренировочных дней"
    backHref="/" backLabel="Назад к курсам">
    {!isCreate && <p className="trainer-form-hint">Версия: {view.snapshot?.version ?? "неизвестна"}</p>}
    {view.phase === "conflict" && <section role="alert">
      <p>Данные курса изменились на сервере. Скопируйте свои изменения, затем обновите снимок.</p>
      <button type="button" disabled={busy}
        onClick={() => setRetry(x => x + 1)}>Загрузить актуальную версию</button>
    </section>}
    <form onSubmit={event => void save(event)}>
      <TrainerFormSection title="Основная информация">
        {field("name", "Название *")}
        {field("shortDesc", "Краткое описание", true)}
        <TrainerMarkdownEditor label="Полное описание" value={draft.description}
          onChange={value => change("description", value)}
          disabled={busy || view.phase === "conflict"} />
        {field("guideContent", "HTML мини-гайда (необязательно)", true)}
        {field("duration", "Длительность *")}
        {field("equipment", "Необходимое оборудование")}
        <fieldset><legend>Уровень сложности</legend>
          <div className="trainer-option-grid trainer-course-level-grid">
            {([
              ["BEGINNER", "Начальный"], ["INTERMEDIATE", "Средний"],
              ["ADVANCED", "Продвинутый"], ["EXPERT", "Экспертный"],
            ] as const).map(([level, label]) =>
              <label className="trainer-option-card" key={level}>
                <input type="radio" name="course-training-level" value={level}
                  checked={draft.trainingLevel === level}
                  disabled={busy || view.phase === "conflict"}
                  onChange={() => change("trainingLevel", level)} />
                <span>{label}</span>
              </label>)}
          </div>
        </fieldset>
      </TrainerFormSection>

      <TrainerFormSection title="Медиа" hint="Добавьте ссылку на видео и обложку курса.">
        {field("videoUrl", "URL видео")}
        <p className="trainer-form-hint">Видеотеку можно просмотреть в разделе <a href="/my-videos">«Мои видео»</a>.
          В новом API сейчас нет маршрута выбора URL по ID видео.</p>
        {field("logoImg", "URL обложки (https)")}
        {draft.logoImg.startsWith("https://") && <img
          className="trainer-course-cover-preview" src={draft.logoImg}
          alt="Предпросмотр обложки курса" referrerPolicy="no-referrer" />}
      </TrainerFormSection>

      <TrainerFormSection title="Доступ">
        <fieldset><legend>Тип курса</legend>
          <div className="trainer-option-grid">
            <label className="trainer-option-card">
              <input type="radio" name="course-access" value="public"
                checked={accessMode === "public"}
                disabled={busy || view.phase === "conflict"}
                onChange={() => setAccessMode("public")} />
              <span><strong>Публичный</strong><br />
                <span className="trainer-form-hint">Доступен всем бесплатно</span></span>
            </label>
            <label className="trainer-option-card">
              <input type="radio" name="course-access" value="private"
                checked={accessMode === "private"}
                disabled={busy || view.phase === "conflict"}
                onChange={() => setAccessMode("private")} />
              <span><strong>Приватный</strong><br />
                <span className="trainer-form-hint">Только выбранным пользователям</span></span>
            </label>
            <label className="trainer-option-card">
              <input type="radio" name="course-access" value="paid"
                checked={accessMode === "paid"}
                disabled={busy || view.phase === "conflict"}
                onChange={() => setAccessMode("paid")} />
              <span><strong>По подписке</strong><br />
                <span className="trainer-form-hint">Доступ зависит от разрешений автора</span></span>
            </label>
          </div>
        </fieldset>
        {checkbox("showInProfile", "Показывать курс в моём профиле")}
        {checkbox("isPersonalized", "Персонализированный курс")}
        <p className="trainer-form-hint">
          Для персонализированного курса в текстах шагов доступны {"{{userName}}"} и {"{{petName}}"}.
        </p>
      </TrainerFormSection>

      {!draft.isPublic && <TrainerFormSection title="Доступ к курсу"
        hint="Выберите учеников, которым будет доступен приватный курс.">
        <label>Поиск ученика по username
          <input value={studentQuery} disabled={busy || studentSearch.phase === "loading"}
            onChange={event => setStudentQuery(event.target.value)} />
        </label>
        <button className="trainer-button-secondary" type="button"
          disabled={busy || studentSearch.phase === "loading" || studentQuery.trim().length < 2}
          onClick={() => void lookupStudents()}>Найти учеников</button>
        {studentSearch.phase === "loading" && <p role="status">Поиск учеников…</p>}
        {studentSearch.phase === "error" && <p role="alert">Поиск недоступен</p>}
        {studentSearch.phase === "ready" && <ul className="trainer-selection-list">
          {studentSearch.data.map(row => <li key={row.id}>
            <span>{row.username}</span>
            <button type="button" className="trainer-button-secondary"
              disabled={busy} onClick={() => chooseStudent(row)}>Добавить</button>
          </li>)}
        </ul>}
        <ul className="trainer-selection-list">
          {draft.allowedUsers.map(userId => <li key={userId}>
            {studentLabels[userId] ?? userId}
            <button type="button" className="trainer-button-subtle" disabled={busy || view.phase === "conflict"}
              onClick={() => change("allowedUsers", draft.allowedUsers.filter(id => id !== userId))}>
              Исключить
            </button>
          </li>)}
        </ul>
        <details><summary>Редактирование списка ID вручную</summary>
          {list("allowedUsers", "ID пользователей (по одному на строку)")}
        </details>
      </TrainerFormSection>}

      <TrainerFormSection title="Тренировочные дни"
        hint="Выберите и расположите дни в нужном порядке прохождения. День можно добавить несколько раз.">
        {availableDays.phase === "loading" && <p role="status">Загружаем доступные дни…</p>}
        {availableDays.phase === "error" && <p role="alert">Не удалось загрузить список дней.
          <button type="button" className="trainer-button-secondary" disabled={busy}
            onClick={() => void loadDays()}>Повторить загрузку</button>
        </p>}
        <TrainerCourseDayPicker available={availableDays.data}
          selectedIds={draft.trainingDays}
          labels={Object.fromEntries(view.snapshot?.dayLinks.map(link =>
            [link.dayId, link.day.title]) ?? [])}
          disabled={busy || view.phase === "conflict"}
          onChange={ids => change("trainingDays", ids)} />
        <details className="trainer-course-manual-ids">
          <summary>Редактировать ID дней вручную (необязательно)</summary>
          {list("trainingDays", "ID дней в порядке прохождения (по одному на строку)")}
        </details>
      </TrainerFormSection>
      <TrainerFormActions>
        <a className="trainer-form-back" href="/">Отмена</a>
        <button type="submit" disabled={busy || view.phase !== "ready"}>
          {busy ? "Сохранение…" : isCreate ? "Создать курс" : "Сохранить курс"}
        </button>
      </TrainerFormActions>
    </form>
    {!isCreate && <button className="trainer-button-danger" type="button"
      disabled={busy || view.phase !== "ready"} onClick={() => void remove()}>Удалить курс</button>}
    {message && <p role="status">{message}</p>}
  </TrainerFormPage>;
}

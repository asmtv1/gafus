import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";
import { readVisibleDays, type VisibleDay } from "./trainerVisibleDaysRead20261022";
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
  function chooseDay(id: string, checked: boolean) {
    if (!view.draft) return;
    change("trainingDays", checked ?
      [...new Set([...view.draft.trainingDays, id])] :
      view.draft.trainingDays.filter(day => day !== id));
  }
  function moveDay(id: string, direction: number) {
    if (!view.draft) return;
    const next = [...view.draft.trainingDays];
    const index = next.indexOf(id);
    if (index < 0 || index + direction < 0 || index + direction >= next.length)
      return;
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    change("trainingDays", next);
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
      new Set(draft.trainingDays).size !== draft.trainingDays.length ||
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
    label: string) => <label key={key}>
    <input type="checkbox" checked={draft[key]} disabled={busy || view.phase === "conflict"}
      onChange={e => change(key, e.target.checked)} />{label}
  </label>;
  const list = (key: "trainingDays" | "allowedUsers", label: string) =>
    <label key={key}>{label}
      <textarea value={draft[key].join("\n")} disabled={busy || view.phase === "conflict"}
        onChange={e => change(key, e.target.value.split("\n")
          .map(s => s.trim()).filter(Boolean))} />
    </label>;
  return <main><h1>{isCreate ? "Создание курса" : "Редактирование курса"}</h1>
    {!isCreate && <p>Версия: {view.snapshot?.version ?? "неизвестна"}</p>}
    <p><a href="/main-panel">Назад к курсам</a></p>
    {view.phase === "conflict" && <section role="alert">
      <p>Данные курса изменились на сервере. Скопируйте свои изменения.
        Затем загрузите свежий снимок.</p>
      <button type="button" disabled={busy}
        onClick={() => setRetry(x => x + 1)}>Загрузить актуальную версию</button>
    </section>}
    <form onSubmit={event => void save(event)}>
      {field("name", "Название *")}
      {field("shortDesc", "Краткое описание", true)}
      {field("description", "Описание", true)}
      {field("guideContent", "Содержание мини-гайда", true)}
      {field("duration", "Длительность *")}
      {field("equipment", "Оборудование")}
      {field("videoUrl", "URL видео")}
      {field("logoImg", "URL обложки (https)")}
      <label>Сложность
        <select value={draft.trainingLevel} disabled={busy || view.phase === "conflict"}
          onChange={e => change("trainingLevel", e.target.value as Draft["trainingLevel"])}>
          {["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].map(level =>
            <option key={level} value={level}>{level}</option>)}
        </select>
      </label>
      {checkbox("isPublic", "Публичный курс")}
      {checkbox("isPaid", "Платный курс")}
      {checkbox("showInProfile", "Показывать в профиле")}
      {checkbox("isPersonalized", "Персонализированный курс")}
      <fieldset><legend>Дни курса</legend>
        <button type="button" disabled={busy || availableDays.phase === "loading"}
          onClick={() => void loadDays()}>Показать доступные дни</button>
        {availableDays.phase === "loading" && <p role="status">Загрузка дней…</p>}
        {availableDays.phase === "error" && <p role="alert">Список дней недоступен</p>}
        {availableDays.phase === "ready" && <ul>{availableDays.data.map(row => <li key={row.id}>
          <label><input type="checkbox" disabled={busy || view.phase === "conflict"}
            checked={draft.trainingDays.includes(row.id)}
            onChange={e => chooseDay(row.id, e.target.checked)} />{row.title}</label>
        </li>)}</ul>}
        <ol>{draft.trainingDays.map((dayId, index) => <li key={dayId}>
          {availableDays.data.find(item => item.id === dayId)?.title ?? dayId}
          <button type="button" disabled={busy || index === 0 || view.phase === "conflict"}
            onClick={() => moveDay(dayId, -1)}>Вверх</button>
          <button type="button" disabled={busy ||
            index === draft.trainingDays.length - 1 || view.phase === "conflict"}
            onClick={() => moveDay(dayId, 1)}>Вниз</button>
          <button type="button" disabled={busy || view.phase === "conflict"}
            onClick={() => chooseDay(dayId, false)}>Убрать</button>
        </li>)}</ol>
        {list("trainingDays", "ID дней в порядке прохождения (по одному на строку)")}
      </fieldset>
      {!draft.isPublic && <fieldset><legend>Доступ пользователей</legend>
        <label>Поиск ученика по username
          <input value={studentQuery} disabled={busy || studentSearch.phase === "loading"}
            onChange={e => setStudentQuery(e.target.value)} />
        </label>
        <button type="button" disabled={busy || studentSearch.phase === "loading" ||
          studentQuery.trim().length < 2} onClick={() => void lookupStudents()}>
          Найти учеников</button>
        {studentSearch.phase === "error" && <p role="alert">Поиск недоступен</p>}
        {studentSearch.phase === "ready" && <ul>{studentSearch.data.map(row => <li key={row.id}>
          {row.username}
          <button type="button" disabled={busy} onClick={() => chooseStudent(row)}>
            Добавить</button>
        </li>)}</ul>}
        <ul>{draft.allowedUsers.map(userId => <li key={userId}>
          {studentLabels[userId] ?? userId}
          <button type="button" disabled={busy || view.phase === "conflict"}
            onClick={() => change("allowedUsers", draft.allowedUsers.filter(id => id !== userId))}>
            Исключить</button>
        </li>)}</ul>
        {list("allowedUsers", "ID пользователей (по одному на строку)")}
      </fieldset>}
      <button type="submit" disabled={busy || view.phase !== "ready"}>
        {busy ? "Сохранение…" : isCreate ? "Создать курс" : "Сохранить курс"}
      </button>
    </form>
    {!isCreate && <button type="button" disabled={busy || view.phase !== "ready"}
      onClick={() => void remove()}>Удалить курс</button>}
    {message && <p role="status">{message}</p>}
  </main>;
}

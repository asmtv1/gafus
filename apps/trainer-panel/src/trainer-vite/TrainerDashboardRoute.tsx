import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";
import type { TrainerFullCourseWriteTransport } from "./TrainerFullCourseEditorRoute";
import { parseVersionedCourseEditorSnapshot } from "./trainerCourseDraftReadContract";

const nonnegative = z.number().int().nonnegative();
const courseId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const courseSchema = z.object({
  id: courseId, name: z.string(), logoImg: z.string(),
  avgRating: z.number().nullable(), isPrivate: z.boolean(), isPaid: z.boolean(),
  isPersonalized: z.boolean(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  // Core merges progress from UserCourse, trainings and started steps, then
  // excludes NOT_STARTED. This is participation, not paid/issued access.
  totalUsers: nonnegative,
  completedUsers: nonnegative, inProgressUsers: nonnegative, notStartedUsers: nonnegative,
  author: z.object({ username: z.string(), fullName: z.string().nullable().optional() }).optional(),
}).strict();
const responseSchema = z.object({
  success: z.literal(true), data: z.object({
    courses: z.array(courseSchema), totalCourses: nonnegative, totalDays: nonnegative,
  }).strict(),
}).strict();
const deleteReceiptSchema = z.object({ success: z.literal(true),
  data: z.object({ id: courseId }).strict(),
}).strict();

type Course = z.infer<typeof courseSchema>;
type State = {
  kind: "loading" | "ready" | "error" | "denied";
  courses: Course[];
};
const privateCache = (headers: Record<string, string>) => {
  const directives = (headers["cache-control"] ?? "").toLowerCase()
    .split(",").map(value => value.trim());
  return directives.includes("private") && directives.includes("no-store") &&
    !directives.includes("public");
};
const initialState = (): State => ({ kind: "loading", courses: [] });

const courseType = (course: Course) => course.isPaid ? "По подписке"
  : course.isPrivate ? "Приватный" : "Публичный";

/** Public course-cover URLs only. Invalid/broken images fall back to the initial. */
function safeCourseLogo(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.startsWith("//") || value.includes("\\")) return null;
  if (value.startsWith("/") && !value.startsWith("/api/")) return value;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password)
      return url.href;
  } catch { /* Unsupported relative or malformed URL. */ }
  return null;
}

function TrainerCourseLogo({ course }: { course: Course }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = safeCourseLogo(course.logoImg);
  return <div className="trainer-overview-course-icon">
    {imageUrl && !failed
      ? <img src={imageUrl} alt={`Обложка курса «${course.name}»`}
          loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailed(true)} />
      : <span aria-hidden="true">
          {course.name.trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "К"}
        </span>}
  </div>;
}
const peopleLabel = (count: number) => {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "человек";
  if (count % 10 === 1) return "человек";
  return count % 10 >= 2 && count % 10 <= 4 ? "человека" : "человек";
};

export function TrainerDashboardRoute(p: {
  actor: PanelActor; token: string | null; authEpoch?: string;
  fetchRead: NotesReadTransport;
  courseWriteTransport?: TrainerFullCourseWriteTransport;
  getCurrentSession: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}) {
  const [state, setState] = useState<State>(initialState);
  const [refresh, setRefresh] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingPhase, setDeletingPhase] = useState<"checking" | "deleting">("checking");
  const [notice, setNotice] = useState("");
  const deleteController = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const currentSessionRef = useRef(p.getCurrentSession);
  currentSessionRef.current = p.getCurrentSession;
  const actorId = p.actor.id;
  const role = p.actor.role;
  const token = p.token;
  const epoch = p.authEpoch;
  const fetchRead = p.fetchRead;
  const write = p.courseWriteTransport;
  const current = useCallback(() => {
    const session = currentSessionRef.current();
    return !!session && session.actor.id === actorId && session.actor.role === role &&
      session.token === token && session.authEpoch === epoch;
  }, [actorId, role, token, epoch]);
  const allowed = !!token && !!epoch && (role === "TRAINER" || role === "ADMIN") && current();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      deleteController.current?.abort();
    };
  }, [actorId, role, token, epoch]);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const controller = new AbortController();
    setState(initialState());
    const scope = role === "ADMIN" ? "all" : "own";
    void fetchRead("/api/v1/trainer/statistics/courses?scope=" + scope,
      controller.signal).then(result => {
      if (!live || controller.signal.aborted || !current()) return;
      if (result.status === 401 || result.status === 403) {
        setState({ kind: "denied", courses: [] });
        return;
      }
      if (result.status !== 200 || !privateCache(result.headers))
        throw Error("DASHBOARD_COURSES_UNTRUSTED");
      const data = responseSchema.parse(result.body).data;
      if (data.totalCourses !== data.courses.length ||
          new Set(data.courses.map(course => course.id)).size !== data.courses.length ||
          data.courses.some(course =>
            course.inProgressUsers + course.completedUsers > course.totalUsers))
        throw Error("DASHBOARD_COURSE_COUNTS_INVALID");
      setState({ kind: "ready", courses: data.courses });
    }).catch(() => {
      if (live && !controller.signal.aborted && current())
        setState({ kind: "error", courses: [] });
    });
    return () => { live = false; controller.abort(); };
  }, [actorId, role, token, epoch, allowed, current, fetchRead, refresh]);

  async function removeCourse(course: Course) {
    if (!allowed || !current() || !mountedRef.current || !write ||
      busyRef.current || state.kind !== "ready" ||
      !state.courses.some(item => item.id === course.id)) return;
    const controller = new AbortController();
    deleteController.current = controller;
    busyRef.current = true;
    setDeletingId(course.id);
    setDeletingPhase("checking");
    setNotice("");
    const readPath = `/api/v1/trainer/courses/${encodeURIComponent(course.id)}/editor-snapshot`;
    try {
      // Read the same actor-fenced, versioned snapshot used by the course editor.
      const snapshotResponse = await fetchRead(readPath, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (snapshotResponse.status === 401 || snapshotResponse.status === 403) {
        setState({ kind: "denied", courses: [] });
        return;
      }
      if (snapshotResponse.status !== 200 || !privateCache(snapshotResponse.headers))
        throw Error("COURSE_SNAPSHOT_NOT_CONFIRMED");
      const snapshot = parseVersionedCourseEditorSnapshot(snapshotResponse.body, course.id);
      if (!window.confirm(
        `Удалить курс «${snapshot.name}»?\n\n` +
        "Будут удалены связанные записи участников, их прогресс и отзывы. " +
        "Это действие нельзя отменить.",
      )) return;
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      setDeletingPhase("deleting");
      const result = await write({
        method: "DELETE", path: `/api/v1/trainer/courses/manage/${encodeURIComponent(course.id)}`,
        body: { expectedVersion: snapshot.version }, signal: controller.signal,
      });
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (result.status === 401 || result.status === 403) {
        setState({ kind: "denied", courses: [] }); return;
      }
      if (result.status === 409) {
        setNotice(`Курс «${course.name}» изменился. Обновите список и повторите удаление.`);
        return;
      }
      if (result.status !== 200 || !privateCache(result.headers) ||
        deleteReceiptSchema.parse(result.body).data.id !== course.id)
        throw Error("COURSE_DELETE_NOT_CONFIRMED");
      // A successful DELETE alone is not enough to remove the card.
      const verified = await fetchRead(readPath, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || !current()) return;
      if (verified.status !== 404 || !privateCache(verified.headers))
        throw Error("COURSE_DELETE_READBACK_NOT_CONFIRMED");
      setState(prev => prev.kind === "ready" ? {
        kind: "ready", courses: prev.courses.filter(item => item.id !== course.id),
      } : prev);
      setNotice(`Курс «${course.name}» удалён.`);
      setRefresh(value => value + 1);
    } catch {
      if (!controller.signal.aborted && mountedRef.current && current())
        setNotice("Удаление не подтверждено. Обновите список курсов перед повтором.");
    } finally {
      if (deleteController.current === controller) deleteController.current = null;
      busyRef.current = false;
      if (mountedRef.current && current()) setDeletingId(null);
    }
  }

  if (!allowed) return <main><h1>Мои курсы</h1>
    <p role="alert">Список доступен тренеру или администратору.</p></main>;
  return <main className="trainer-overview" aria-label="Управление курсами">
    <header className="trainer-overview-heading">
      <h1>{role === "ADMIN" ? "Все курсы" : "Мои курсы"}</h1>
    </header>
    {notice && <p className="trainer-overview-notice" role="status">{notice}</p>}
    {state.kind === "loading" && <p className="trainer-overview-message" role="status">
      Загружаем курсы…</p>}
    {state.kind === "denied" && <p role="alert">Нет доступа к списку курсов.</p>}
    {state.kind === "error" && <div className="trainer-overview-message" role="alert">
      <p>Не удалось загрузить курсы.</p>
      <button type="button" onClick={() => setRefresh(value => value + 1)}>Повторить</button>
    </div>}
    {state.kind === "ready" && (state.courses.length === 0
      ? <div className="trainer-overview-message" role="status">Курсов пока нет.</div>
      : <ul className="trainer-overview-list" aria-label="Список курсов">
        {state.courses.map(course => <li key={course.id}>
          <article className="trainer-overview-card">
            <TrainerCourseLogo key={course.id + ":" + course.logoImg} course={course} />
            <div className="trainer-overview-course-body">
              <h2>{course.name}</h2>
              <span className={"trainer-overview-course-type " +
                (course.isPaid ? "is-subscription" : course.isPrivate ? "is-private" : "is-public")}>
                {courseType(course)}
              </span>
              <p className="trainer-overview-count">
                Курс начали: <strong>{course.totalUsers}</strong> {peopleLabel(course.totalUsers)}
              </p>
              <div className="trainer-overview-actions">
                <a className="trainer-overview-edit"
                  href={`/courses/${encodeURIComponent(course.id)}/edit`}>
                  Редактировать курс
                </a>
                <button type="button" className="trainer-overview-delete"
                  disabled={deletingId !== null || !write}
                  aria-label={`Удалить курс «${course.name}»`}
                  onClick={() => void removeCourse(course)}>
                  {deletingId === course.id
                    ? deletingPhase === "checking" ? "Проверяем…" : "Удаляем…"
                    : "Удалить курс"}
                </button>
              </div>
            </div>
          </article>
        </li>)}
      </ul>)}
  </main>;
}

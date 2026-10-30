import { useCallback, useEffect, useState } from "react";
import { z } from "zod/v3";
import type { PanelActor } from "./consultationContract";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";

const nonnegative = z.number().int().nonnegative();
const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  logoImg: z.string(),
  avgRating: z.number().nullable(),
  isPrivate: z.boolean(),
  isPaid: z.boolean(),
  isPersonalized: z.boolean(),
  trainingLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  totalUsers: nonnegative,
  completedUsers: nonnegative,
  inProgressUsers: nonnegative,
  notStartedUsers: nonnegative,
  author: z.object({
    username: z.string(),
    fullName: z.string().nullable().optional(),
  }).optional(),
}).strict();
const courseResponse = z.object({
  success: z.literal(true),
  data: z.object({
    courses: z.array(courseSchema),
    totalCourses: nonnegative,
    totalDays: nonnegative,
  }).strict(),
}).strict();
const stepsResponse = z.object({
  success: z.literal(true),
  data: z.object({
    totalSteps: nonnegative,
    progressMetrics: z.literal("NOT_COMPUTED"),
    steps: z.array(z.object({
      id: z.string(), title: z.string(), durationSec: nonnegative.nullable(),
      usedInDaysCount: nonnegative, usedInCoursesCount: nonnegative,
    }).strict()),
  }).strict(),
}).strict();
type Course = z.infer<typeof courseSchema>;
const privateCache = (headers: Record<string, string>) => {
  const tokens = (headers["cache-control"] ?? "").toLowerCase().split(",")
    .map(x => x.trim());
  return tokens.includes("private") && tokens.includes("no-store") &&
    !tokens.includes("public");
};
export function TrainerDashboardRoute(p: {
  actor: PanelActor; token: string | null; authEpoch?: string;
  fetchRead: NotesReadTransport;
  getCurrentSession: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
}) {
  const [state, setState] = useState<{
    kind: "loading" | "ready" | "error" | "denied";
    courses: Course[]; totalDays: number; totalSteps: number;
  }>({ kind: "loading", courses: [], totalDays: 0, totalSteps: 0 });
  const [refresh, setRefresh] = useState(0);
  const id = p.actor.id;
  const role = p.actor.role;
  const token = p.token;
  const epoch = p.authEpoch;
  const getCurrentSession = p.getCurrentSession;
  const fetchRead = p.fetchRead;
  const current = useCallback(() => {
    const session = getCurrentSession();
    return !!session && session.actor.id === id &&
      session.actor.role === role && session.authEpoch === epoch &&
      session.token === token;
  }, [getCurrentSession, id, role, token, epoch]);
  const allowed = !!token && !!epoch && current() &&
    (role === "TRAINER" || role === "ADMIN");
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const controller = new AbortController();
    setState({ kind: "loading", courses: [], totalDays: 0, totalSteps: 0 });
    const suffix = role === "ADMIN" ? "?scope=all" : "?scope=own";
    void Promise.all([
      fetchRead("/api/v1/trainer/statistics/courses" + suffix, controller.signal),
      fetchRead("/api/v1/trainer/statistics/steps" + suffix, controller.signal),
    ]).then(([coursesRaw, stepsRaw]) => {
      if (!live || !current()) return;
      if ([coursesRaw.status, stepsRaw.status].some(x => x === 401 || x === 403)) {
        setState({ kind: "denied", courses: [], totalDays: 0, totalSteps: 0 });
        return;
      }
      if (coursesRaw.status !== 200 || stepsRaw.status !== 200 ||
        !privateCache(coursesRaw.headers) || !privateCache(stepsRaw.headers))
        throw Error("UNSAFE_DASHBOARD_DATA");
      const courses = courseResponse.parse(coursesRaw.body).data;
      const steps = stepsResponse.parse(stepsRaw.body).data;
      if (courses.totalCourses !== courses.courses.length ||
        steps.totalSteps !== steps.steps.length)
        throw Error("COUNTS_MISMATCH");
      setState({ kind: "ready", courses: courses.courses,
        totalDays: courses.totalDays, totalSteps: steps.totalSteps });
    }).catch(() => {
      if (live && !controller.signal.aborted && current())
        setState({ kind: "error", courses: [], totalDays: 0, totalSteps: 0 });
    });
    return () => { live = false; controller.abort(); };
  }, [id, role, token, epoch, allowed, current, fetchRead, refresh]);
  if (!allowed) return <main><h1>Панель тренера</h1>
    <p role="alert">Сводка доступна тренеру или администратору.</p></main>;
  return <main>
    <h1>Панель тренера</h1>
    <nav aria-label="Быстрые действия">
      <a href="/main-panel/courses/new">Создать курс</a>{" · "}
      <a href="/main-panel/days/new">Создать день</a>{" · "}
      <a href="/main-panel/steps/new">Создать шаг</a>{" · "}
      <a href="/main-panel/exam-results">Экзамены</a>
    </nav>
    {state.kind === "loading" && <p role="status">Загрузка курсов и статистики…</p>}
    {state.kind === "denied" && <p role="alert">Нет доступа к статистике</p>}
    {state.kind === "error" && <p role="alert">Не удалось получить данные
      <button type="button" onClick={() => setRefresh(x => x + 1)}>Повторить</button>
    </p>}
    {state.kind === "ready" && <>
      <section aria-label="Сводка">
        <p>Курсов: {state.courses.length}. Дней: {state.totalDays}. Шагов: {state.totalSteps}.</p>
      </section>
      <section aria-label="Мои курсы">
        <h2>{role === "ADMIN" ? "Все курсы" : "Мои курсы"}</h2>
        {!state.courses.length && <p>Курсов пока нет</p>}
        <ul>{state.courses.map(course => <li key={course.id}>
          <strong>{course.name}</strong>
          {" · "}{course.totalUsers} участников
          {" · "}{course.isPrivate ? "Приватный" : "Публичный"}
          {" · "}{course.isPaid ? "Платный" : "Бесплатный"}
          {" · "}<a href={"/main-panel/courses/" +
            encodeURIComponent(course.id) + "/edit"}>Редактировать</a>
        </li>)}</ul>
      </section>
    </>}
  </main>;
}

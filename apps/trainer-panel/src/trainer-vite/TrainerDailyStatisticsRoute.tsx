import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { PanelActor } from "./consultationContract";
import { initialDailyCalendarFrom } from "./trainerDailyDefaultRange";
import { shift } from "./tr014ScheduleRangeRead20261022";

const scheduleSchema = z.object({
  id: z.string(), date: z.string(), isPublished: z.boolean(),
  bundle: z.object({ id: z.string(), title: z.string(), type: z.string(),
    stepsCount: z.number() }).strict(),
  createdBy: z.object({ id: z.string(), username: z.string() }).strict(),
}).strict();
const stepSchema = z.object({
  bundleStepId: z.string(), stepId: z.string(), title: z.string(),
  order: z.number(), status: z.string(), paused: z.boolean(),
  remainingSec: z.number().nullable(),
  createdAt: z.string().datetime().nullable(), updatedAt: z.string().datetime().nullable(),
}).strict();
const userSchema = z.object({
  userId: z.string(), username: z.string(), openedAt: z.string().datetime(),
  status: z.string(), completedSteps: z.number(), totalSteps: z.number(),
  lastActivityAt: z.string().datetime(), currentStepTitle: z.string().nullable(),
  steps: z.array(stepSchema),
}).strict();
const statisticsSchema = z.object({
  scheduleId: z.string(), mskDate: z.string(), bundleId: z.string(),
  title: z.string(), totalSteps: z.number(),
  summary: z.object({ openedUsers: z.number(), startedUsers: z.number(),
    completedUsers: z.number(), openedWithoutStartUsers: z.number() }).strict(),
  users: z.array(userSchema),
}).strict();
const responseSchema = z.object({ success: z.literal(true), data: z.object({
  schedule: z.array(scheduleSchema), selectedScheduleId: z.string().nullable(),
  statistics: statisticsSchema.nullable(),
}).strict() }).strict();
type StatsRead = z.infer<typeof responseSchema>["data"];
export type TrainerDailyStatisticsTransport = (path: string, signal: AbortSignal) =>
  Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export type TrainerDailyStatisticsProps = {
  pathname: string; search?: string; actor: PanelActor;
  token: string | null; authEpoch?: string;
  enableDailyStatistics?: boolean;
  dailyStatisticsTransport?: TrainerDailyStatisticsTransport;
  getCurrentSession?: () => {
    actor: PanelActor; token: string | null; authEpoch?: string;
  } | null;
};
function dateKey(value: string): boolean {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ?
    new Date(`${value}T00:00:00.000Z`) : new Date("invalid");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function TrainerDailyStatisticsRoute(p: TrainerDailyStatisticsProps) {
  const params = new URLSearchParams(p.search ?? "");
  const fallbackFrom = initialDailyCalendarFrom(p.search);
  const [from, setFrom] = useState(fallbackFrom);
  const [to, setTo] = useState(dateKey(params.get("to") ?? "") ? params.get("to")! : shift(fallbackFrom, 29));
  const [selected, setSelected] = useState(params.get("scheduleId") ?? "");
  const [formFrom, setFormFrom] = useState(from);
  const [formTo, setFormTo] = useState(to);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; phase: "loading" | "ready" | "error";
    data: StatsRead | null }>({ key: "", phase: "loading", data: null });
  const ref = useRef(p.getCurrentSession);
  ref.current = p.getCurrentSession;
  const isCurrent = () => {
    const s = ref.current ? ref.current() : {
      actor: p.actor, token: p.token, authEpoch: p.authEpoch,
    };
    return !!s && s.actor.id === p.actor.id && s.actor.role === p.actor.role &&
      s.token === p.token && s.authEpoch === p.authEpoch;
  };
  const principal = JSON.stringify([p.actor.id, p.actor.role, p.token, p.authEpoch]);
  const allowed = p.pathname === "/main-panel/daily-course/statistics" &&
    p.enableDailyStatistics === true && !!p.dailyStatisticsTransport &&
    !!p.token && !!p.authEpoch && isCurrent() &&
    ["TRAINER", "ADMIN", "MODERATOR"].includes(p.actor.role);
  const key = JSON.stringify([principal, from, to, selected]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setState({ key, phase: "loading", data: null });
    if (allowed && dateKey(from) && dateKey(to) && from <= to) {
      const query = new URLSearchParams({ from, to });
      if (selected) query.set("scheduleId", selected);
      void p.dailyStatisticsTransport!(`/api/v1/trainer/daily-course/statistics?${query}`, controller.signal)
        .then(response => {
          if (!live || controller.signal.aborted || !isCurrent()) return;
          const cache = (response.headers["cache-control"] ?? "").toLowerCase()
            .split(",").map(value => value.trim());
          if (response.status !== 200 || !cache.includes("private") ||
              !cache.includes("no-store") || cache.includes("public")) throw Error("READ_DENIED");
          const data = responseSchema.parse(response.body).data;
          if (data.selectedScheduleId &&
              !data.schedule.some(item => item.id === data.selectedScheduleId)) throw Error("FOREIGN_SELECTION");
          if (data.statistics && data.statistics.scheduleId !== data.selectedScheduleId)
            throw Error("WRONG_STATISTICS");
          setState({ key, phase: "ready", data });
        }).catch(() => {
          if (live && isCurrent()) setState({ key, phase: "error", data: null });
        });
    }
    return () => { live = false; controller.abort(); };
    // Transport and actor identity own the request lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowed, retry, p.dailyStatisticsTransport]);
  if (!allowed) return <main><p role="alert">Статистика курса дня недоступна</p></main>;
  const shown = state.key === key ? state : { phase: "loading" as const, data: null };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dateKey(formFrom) && dateKey(formTo) && formFrom <= formTo) {
      setFrom(formFrom); setTo(formTo);
    }
  };
  return <main data-trainer-daily-statistics="hono-read">
    <h1>Статистика курса дня</h1>
    <p>Детальная статистика по пользователям, которые открывали выбранный день</p>
    <form onSubmit={onSubmit}>
      <label>С<input type="date" value={formFrom} onChange={e => setFormFrom(e.target.value)} /></label>
      <label>По<input type="date" value={formTo} onChange={e => setFormTo(e.target.value)} /></label>
      <button type="submit">Показать</button>
    </form>
    {shown.phase === "loading" && <p role="status">Загрузка статистики</p>}
    {shown.phase === "error" && <p role="alert">Не удалось получить статистику
      <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button>
    </p>}
    {shown.phase === "ready" && shown.data && <section>
      {shown.data.schedule.length === 0 &&
        <p role="status">В выбранном диапазоне нет запланированных дней курса дня.</p>}
      {shown.data.schedule.length > 0 && <label>День курса дня
        <select value={shown.data.selectedScheduleId ?? ""} onChange={e => setSelected(e.target.value)}>
          {shown.data.schedule.map(item => <option key={item.id} value={item.id}>
            {item.date} · {item.bundle.title}
          </option>)}
        </select>
      </label>}
      {shown.data.statistics && <>
        <dl>
          <dt>Открыли день</dt><dd>{shown.data.statistics.summary.openedUsers}</dd>
          <dt>Начали шаги</dt><dd>{shown.data.statistics.summary.startedUsers}</dd>
          <dt>Завершили день</dt><dd>{shown.data.statistics.summary.completedUsers}</dd>
          <dt>Открыли без старта</dt>
          <dd>{shown.data.statistics.summary.openedWithoutStartUsers}</dd>
        </dl>
        {shown.data.statistics.users.length === 0 ?
          <p role="status">Этот день курса дня ещё никто не открывал.</p> :
          <table><thead><tr><th>Пользователь</th><th>Статус</th><th>Прогресс</th>
            <th>Текущий шаг</th><th>Последняя активность</th></tr></thead>
            <tbody>{shown.data.statistics.users.map(user => <tr key={user.userId}>
              <td><details><summary>{user.username}</summary><ol>
                {user.steps.map(step => <li key={step.bundleStepId}>
                  {step.title} — {step.status}</li>)}
              </ol></details></td>
              <td>{user.status}</td><td>{user.completedSteps}/{user.totalSteps}</td>
              <td>{user.currentStepTitle ?? "Нет"}</td><td>{user.lastActivityAt}</td>
            </tr>)}</tbody></table>}
      </>}
    </section>}
  </main>;
}

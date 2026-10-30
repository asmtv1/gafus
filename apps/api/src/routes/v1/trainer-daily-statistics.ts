/** Exact Next trainer DailyCourseStatistics page read, now via authenticated Hono. */
import { Hono } from "hono";
import {
  getDailyCourseScheduleRange,
  getDailyCourseScheduleStatistics,
  getMoscowDateKey,
  type DailyCourseActor,
  type DailyCourseScheduleDto,
  type DailyCourseScheduleStatisticsDto,
} from "@gafus/core/services/dailyCourse";

type Result = { schedule: DailyCourseScheduleDto[];
  selectedScheduleId: string | null; statistics: DailyCourseScheduleStatisticsDto | null };
export type TrainerDailyStatisticsPorts = {
  range: (actor: DailyCourseActor, input: { from: string; to: string }) =>
    Promise<DailyCourseScheduleDto[]>;
  statistics: (actor: DailyCourseActor, input: { scheduleId: string }) =>
    Promise<DailyCourseScheduleStatisticsDto | null>;
  today: () => string;
};
const corePorts: TrainerDailyStatisticsPorts = {
  range: getDailyCourseScheduleRange,
  statistics: getDailyCourseScheduleStatistics,
  today: getMoscowDateKey,
};
function dateKey(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function createTrainerDailyStatisticsRoutes(ports: TrainerDailyStatisticsPorts = corePorts) {
  const app = new Hono();
  app.get("/", async c => {
    const signedActor = c.get("user") as DailyCourseActor | undefined;
    if (!signedActor?.id || !["TRAINER", "ADMIN", "MODERATOR"].includes(signedActor.role))
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    const params = c.req.queries();
    if (Object.keys(params).some(key => !["from", "to", "scheduleId"].includes(key)) ||
        Object.values(params).some(values => values.length !== 1) || c.req.raw.body !== null)
      return c.json({ success: false, code: "BAD_QUERY" }, 400);
    const actor: DailyCourseActor = { id: signedActor.id, role: signedActor.role };
    const today = ports.today();
    const from = params.from?.[0] ?? today;
    const to = params.to?.[0] ?? addDays(today, 29);
    const selected = params.scheduleId?.[0];
    if (!dateKey(from) || !dateKey(to) || from > to ||
        (selected !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(selected)))
      return c.json({ success: false, code: "BAD_QUERY" }, 400);
    try {
      // Same source semantics as Next: fall back to the first visible schedule.
      const schedule = await ports.range(actor, { from, to });
      const selectedScheduleId = selected && schedule.some(item => item.id === selected) ?
        selected : (schedule[0]?.id ?? null);
      const statistics = selectedScheduleId ?
        await ports.statistics(actor, { scheduleId: selectedScheduleId }) : null;
      const data: Result = { schedule, selectedScheduleId, statistics };
      return c.json({ success: true, data });
    } catch {
      return c.json({ success: false, code: "INTERNAL_SERVER_ERROR" }, 500);
    }
  });
  return app;
}
export const trainerDailyStatisticsRoutes = createTrainerDailyStatisticsRoutes();

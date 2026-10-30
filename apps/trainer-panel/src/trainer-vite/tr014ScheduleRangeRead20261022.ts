import { z } from "zod/v3";
import type {
  TrainerDailyScheduleItem,
  TrainerDailyScheduleRangeRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
export const PATH = "/api/v1/trainer/daily-course/schedule-range";
const key = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const scheduleDto = z
  .object({
    id: z.string().min(1),
    date: key,
    isPublished: z.boolean(),
    bundle: z
      .object({
        id: z.string().min(1),
        title: z.string(),
        type: z.string(),
        stepsCount: z.number().int().nonnegative(),
      })
      .strict(),
    createdBy: z.object({ id: z.string().min(1), username: z.string() }).strict(),
  })
  .strict();
export type Schedule = TrainerDailyScheduleItem;
export type ScheduleTransport = (
  path: string,
  signal: AbortSignal,
) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export function shift(keyDate: string, days: number) {
  const d = new Date(`${keyDate}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) throw Error("DATE");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export async function readRange(p: {
  from: string;
  to: string;
  transport: ScheduleTransport;
  signal: AbortSignal;
  isCurrent: () => boolean;
}): Promise<Schedule[]> {
  key.parse(p.from);
  key.parse(p.to);
  if (p.from > p.to || p.signal.aborted || !p.isCurrent()) throw Error("RETIRED_OR_RANGE");
  const r = await p.transport(`${PATH}?from=${p.from}&to=${p.to}`, p.signal);
  if (p.signal.aborted || !p.isCurrent()) throw Error("RETIRED");
  const cc = (r.headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (!cc.includes("private") || !cc.includes("no-store") || cc.includes("public"))
    throw Error("CACHE");
  if (r.status !== 200) throw Error(`HTTP_${r.status}`);
  const data = (
    z
      .object({ success: z.literal(true), data: z.array(scheduleDto) })
      .strict()
      .parse(r.body) satisfies TrainerDailyScheduleRangeRead
  ).data;
  if (
    data.some((v, i) => v.date < p.from || v.date > p.to || (i > 0 && data[i - 1]!.date > v.date))
  )
    throw Error("ORDER");
  return data;
}

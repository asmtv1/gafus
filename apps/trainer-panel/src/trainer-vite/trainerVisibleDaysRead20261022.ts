import { z } from "zod";
import type {
  TrainerVisibleDayItem,
  TrainerVisibleDaysRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
export const visibleDaySchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    equipment: z.string(),
    description: z.string(),
    type: z.string(),
    authorId: z.string().min(1),
    showCoursePathExport: z.boolean(),
    shareProgressAcrossCourses: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    author: z
      .object({
        username: z.string(),
        profile: z.object({ fullName: z.string().nullable() }).strict().nullable(),
      })
      .strict(),
    stepLinks: z.array(
      z
        .object({
          id: z.string().min(1),
          order: z.number().int().nonnegative(),
          step: z.object({ id: z.string().min(1), title: z.string() }).strict(),
        })
        .strict(),
    ),
    dayLinks: z.array(
      z
        .object({
          id: z.string().min(1),
          order: z.number().int().nonnegative(),
          course: z.object({ id: z.string().min(1), name: z.string() }).strict(),
        })
        .strict(),
    ),
  })
  .strict();
export type VisibleDay = TrainerVisibleDayItem;
export const VISIBLE_DAYS_PATH = "/api/v1/trainer/days" as const;
export type VisibleDaysTransport = (
  path: string,
  signal: AbortSignal,
) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
export async function readVisibleDays(input: {
  actorId: string;
  role: "TRAINER" | "ADMIN" | "MODERATOR";
  signal: AbortSignal;
  isCurrent: () => boolean;
  transport: VisibleDaysTransport;
}): Promise<VisibleDay[]> {
  if (!input.actorId || input.signal.aborted || !input.isCurrent()) throw Error("SESSION_RETIRED");
  const r = await input.transport(VISIBLE_DAYS_PATH, input.signal);
  if (input.signal.aborted || !input.isCurrent()) throw Error("SESSION_RETIRED");
  const cache = (r.headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (!cache.includes("private") || !cache.includes("no-store") || cache.includes("public"))
    throw Error("UNSAFE_CACHE");
  if (r.status !== 200) throw Error(`HTTP_${r.status}`);
  const rows = (
    z
      .object({ success: z.literal(true), data: z.array(visibleDaySchema) })
      .strict()
      .parse(r.body) satisfies TrainerVisibleDaysRead
  ).data;
  if (input.role === "TRAINER" && rows.some((x) => x.authorId !== input.actorId))
    throw Error("FOREIGN_DAY");
  if (
    rows.some(
      (x) =>
        x.stepLinks.some((l, i) => i > 0 && x.stepLinks[i - 1]!.order > l.order) ||
        x.dayLinks.some((l, i) => i > 0 && x.dayLinks[i - 1]!.order > l.order),
    )
  )
    throw Error("UNSORTED_RELATIONS");
  if (rows.some((x, i) => i > 0 && rows[i - 1]!.createdAt < x.createdAt))
    throw Error("UNSORTED_DAYS");
  return rows;
}

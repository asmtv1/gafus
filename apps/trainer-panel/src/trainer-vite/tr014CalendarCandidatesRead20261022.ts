import { z } from "zod";
import type {
  TrainerDailyCandidateItem,
  TrainerDailyCandidatesRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
import type { ScheduleTransport } from "./tr014ScheduleRangeRead20261022";
const schema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    type: z.string(),
    stepsCount: z.number().int().nonnegative(),
    authorId: z.string().min(1),
    authorUsername: z.string(),
  })
  .strict();
export type CalendarCandidate = TrainerDailyCandidateItem;
export async function readCalendarCandidates(p: {
  actorId: string;
  role: "TRAINER" | "ADMIN" | "MODERATOR";
  signal: AbortSignal;
  isCurrent: () => boolean;
  transport: ScheduleTransport;
}): Promise<CalendarCandidate[]> {
  if (!p.actorId || p.signal.aborted || !p.isCurrent()) throw Error("RETIRED");
  const r = await p.transport("/api/v1/trainer/daily-course/candidates", p.signal);
  if (p.signal.aborted || !p.isCurrent()) throw Error("RETIRED");
  const cache = (r.headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (!cache.includes("private") || !cache.includes("no-store") || cache.includes("public"))
    throw Error("UNSAFE_CACHE");
  if (r.status !== 200) throw Error(`HTTP_${r.status}`);
  const rows = (
    z
      .object({ success: z.literal(true), data: z.array(schema) })
      .strict()
      .parse(r.body) satisfies TrainerDailyCandidatesRead
  ).data;
  if (p.role === "TRAINER" && rows.some((x) => x.authorId !== p.actorId)) throw Error("FOREIGN");
  return rows;
}

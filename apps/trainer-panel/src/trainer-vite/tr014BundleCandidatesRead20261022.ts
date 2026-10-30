import { z } from "zod/v3";
import type {
  TrainerDailyBundleStepCandidateItem,
  TrainerDailyBundleStepCandidatesRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
import type { DailyBundleTransport } from "./TrainerDailyBundlesOptInRoute";
export const TR014_CANDIDATES_PATH = "/api/v1/trainer/daily-course/bundle-step-candidates" as const;
export const candidateSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    type: z.string().min(1),
    durationSec: z.number().int().nullable(),
    authorId: z.string().min(1),
    authorUsername: z.string(),
  })
  .strict();
export type Candidate = TrainerDailyBundleStepCandidateItem;
export async function readBundleCandidates(input: {
  actorId: string;
  role: "TRAINER" | "ADMIN" | "MODERATOR";
  signal: AbortSignal;
  isCurrent: () => boolean;
  transport: DailyBundleTransport;
}): Promise<Candidate[]> {
  if (!input.actorId || input.signal.aborted || !input.isCurrent()) throw Error("RETIRED");
  const r = await input.transport(TR014_CANDIDATES_PATH, input.signal);
  if (input.signal.aborted || !input.isCurrent()) throw Error("RETIRED");
  const cache = (r.headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (!cache.includes("private") || !cache.includes("no-store") || cache.includes("public"))
    throw Error("UNSAFE_CACHE");
  if (r.status !== 200) throw Error(`HTTP_${r.status}`);
  const rows = (
    z
      .object({ success: z.literal(true), data: z.array(candidateSchema) })
      .strict()
      .parse(r.body) satisfies TrainerDailyBundleStepCandidatesRead
  ).data;
  if (input.role === "TRAINER" && rows.some((x) => x.authorId !== input.actorId))
    throw Error("FOREIGN_CANDIDATE");
  return rows;
}

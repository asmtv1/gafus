/** AG4 TR014: proposed source/mock-only READ, no registered Hono route. */
import { z } from "zod/v3";
import type {
  TrainerDailyBundleItem,
  TrainerDailyBundlesRead,
} from "../../../../packages/types/src/data/trainer-read-contracts";
const id = z.string().min(1);
export const bundleSchema = z
  .object({
    id,
    title: z.string(),
    type: z.string(),
    stepsCount: z.number().int().nonnegative(),
    authorId: id,
    authorUsername: z.string(),
    equipment: z.string(),
    description: z.string(),
    steps: z.array(
      z.object({ id, title: z.string(), type: z.string(), order: z.number().int() }).strict(),
    ),
  })
  .strict();
export type DailyBundle = TrainerDailyBundleItem;
export const TR014_PROPOSED_PATH = "/api/v1/trainer/daily-course/bundles" as const;
export async function readDailyBundles(
  input:
    | { enabled: false }
    | {
        enabled: true;
        role: "TRAINER" | "ADMIN" | "MODERATOR";
        actorId: string;
        signal: AbortSignal;
        isCurrent: () => boolean;
        transport: (
          path: string,
          signal: AbortSignal,
        ) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
      },
): Promise<DailyBundle[]> {
  if (!input.enabled) throw Error("TR014_DISABLED");
  if (!input.actorId || input.signal.aborted || !input.isCurrent())
    throw Error("TR014_SESSION_RETIRED");
  const r = await input.transport(TR014_PROPOSED_PATH, input.signal);
  if (input.signal.aborted || !input.isCurrent()) throw Error("TR014_SESSION_RETIRED");
  const c = (r.headers["cache-control"] ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (!c.includes("private") || !c.includes("no-store") || c.includes("public"))
    throw Error("TR014_UNSAFE_CACHE");
  if (r.status !== 200) throw Error(`TR014_HTTP_${r.status}`);
  const rows = (
    z
      .object({ success: z.literal(true), data: z.array(bundleSchema) })
      .strict()
      .parse(r.body) satisfies TrainerDailyBundlesRead
  ).data;
  if (input.role === "TRAINER" && rows.some((x) => x.authorId !== input.actorId))
    throw Error("TR014_FOREIGN_AUTHOR");
  if (rows.some((x) => x.stepsCount !== x.steps.length)) throw Error("TR014_COUNT_MISMATCH");
  return rows;
}

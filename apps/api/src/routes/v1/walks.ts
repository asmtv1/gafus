import { Hono, type Context } from "hono";
import { z } from "zod/v3";
import { listCompletedDogWalks, syncCompletedDogWalks } from "@gafus/core/services/walks";

export const walksRoutes = new Hono();
walksRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const completed = z.object({
  clientId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  durationSeconds: z.number().int().min(0).max(604800),
  steps: z.number().int().min(0).max(2_000_000),
  estimatedMeters: z.number().int().min(0).max(1_000_000),
  timerMode: z.enum(["stopwatch", "countdown"]),
  incompleteSteps: z.boolean(),
}).strict().superRefine((walk, ctx) => {
  const from = Date.parse(walk.startedAt);
  const to = Date.parse(walk.finishedAt);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from ||
      from < Date.UTC(2020,0,1) || to > Date.now() + 86400_000 ||
      walk.durationSeconds * 1000 > to - from + 1000) {
    ctx.addIssue({ code: "custom", message: "INVALID_WALK_TIME" });
  }
});
const syncSchema = z.object({ walks: z.array(completed).max(100) }).strict().superRefine((payload, ctx) => {
  const ids = payload.walks.map(walk => walk.clientId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "DUPLICATE_CLIENT_ID" });
  }
});

function responseError(c: Context, error: unknown) {
  if (error instanceof Error && error.message === "WALKS_FORBIDDEN") {
    return c.json({ success: false, code: "FORBIDDEN" }, 403);
  }
  return c.json({ success: false, code: "WALKS_UNAVAILABLE" }, 503);
}

walksRoutes.get("/", async c => {
  try {
    const data = await listCompletedDogWalks(c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    return responseError(c, error);
  }
});

walksRoutes.put("/sync", async c => {
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > 100_000) return c.json({ success: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  const raw = await c.req.text().catch(() => "");
  if (raw.length > 100_000) return c.json({ success: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  let payload: z.infer<typeof syncSchema>;
  try {
    const valid = syncSchema.safeParse(JSON.parse(raw));
    if (!valid.success) return c.json({ success: false, code: "INVALID_WALKS" }, 400);
    payload = valid.data;
  } catch {
    return c.json({ success: false, code: "INVALID_WALKS" }, 400);
  }
  try {
    const data = await syncCompletedDogWalks(c.get("user").id, payload.walks);
    return c.json({ success: true, data });
  } catch (error) {
    return responseError(c, error);
  }
});

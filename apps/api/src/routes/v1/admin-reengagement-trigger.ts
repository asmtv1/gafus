import { Hono } from "hono";
import { z } from "zod/v3";
import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { manualTriggerScheduler } from "@gafus/reengagement";
import { requireRole } from "../../middleware/auth.js";

/** Explicit operator action from the old Next admin; NEVER called on GET. */
export const adminReengagementTriggerRoutes = new Hono();
adminReengagementTriggerRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
const bodySchema = z.object({ confirmation: z.literal("RUN_REENGAGEMENT") }).strict();
const lockKey = "gafus:admin:reengagement:manual-run";

adminReengagementTriggerRoutes.post("/run", requireRole("ADMIN"), async c => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "CONFIRMATION_REQUIRED" }, 400);
  const actorId = c.get("user").id;
  let token: string | null = null;
  try {
    const actor = await prisma.user.findUnique({
      where: { id: actorId }, select: { role: true },
    });
    if (actor?.role !== "ADMIN") return c.json({ success: false, code: "FORBIDDEN" }, 403);
    // Single operator invocation across API processes; Redis outage MUST fail closed.
    token = crypto.randomUUID();
    const acquired = await connection.set(lockKey, token, "PX", 15 * 60_000, "NX");
    if (acquired !== "OK") return c.json({ success: false, code: "ALREADY_RUNNING" }, 409);
    const result = await manualTriggerScheduler();
    if (!result.success || !result.result) {
      return c.json({ success: false, code: "SCHEDULER_FAILED" }, 503);
    }
    return c.json({ success: true, data: result.result });
  } catch {
    return c.json({ success: false, code: "SCHEDULER_UNAVAILABLE" }, 503);
  } finally {
    if (token) {
      // Compare-and-delete; never unlock a newer run if the old lease expired.
      await connection.eval(
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        1, lockKey, token,
      ).catch(() => undefined);
    }
  }
});

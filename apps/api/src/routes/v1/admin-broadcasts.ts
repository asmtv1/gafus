import { Hono } from "hono";
import { createHash } from "node:crypto";
import { connection } from "@gafus/queues";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import { sendBroadcastPush } from "@gafus/core/services/adminBroadcast";
import { requireRole } from "../../middleware/auth.js";

/** Admin-only deliberate push broadcasts; never fire on route read or preview. */
export const adminBroadcastRoutes = new Hono();
adminBroadcastRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
const messageSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(300),
  url: z.string().trim().max(512).regex(/^\/(?!\/)/).optional(),
  // Deliberate acknowledgement that the request can send to ALL subscriptions.
  confirmation: z.literal("SEND_TO_ALL_SUBSCRIBERS"),
  // Stable across retries of the same operator action; a different message requires a new key.
  idempotencyKey: z.string().uuid(),
}).strict();

async function adminInDatabase(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId }, select: { role: true },
  });
  return actor?.role === "ADMIN";
}

adminBroadcastRoutes.get("/preview", requireRole("ADMIN"), async c => {
  try {
    if (!(await adminInDatabase(c.get("user").id))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    // Database subscription count is not the same as deliverable push endpoints.
    const subscriptions = await prisma.pushSubscription.count();
    return c.json({ success: true, data: { subscriptions, kind: "raw_subscription_rows" } });
  } catch {
    return c.json({ success: false, code: "BROADCAST_PREVIEW_UNAVAILABLE" }, 503);
  }
});

// A broadcast cannot be safely retried after a crash or an ambiguous provider response.
// Keep an operator action reserved for seven days; Redis failures fail closed.
const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;
type BroadcastMarker = {
  fingerprint: string;
  state: "IN_PROGRESS" | "SUCCEEDED" | "UNKNOWN";
  data?: { totalUsers: number; sentCount: number; failedCount: number };
};
const digest = (input: string) => createHash("sha256").update(input).digest("hex");

adminBroadcastRoutes.post("/", requireRole("ADMIN"), async c => {
  const parsed = messageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_BROADCAST" }, 400);
  const actorId = c.get("user").id;
  try {
    if (!(await adminInDatabase(actorId))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
  } catch {
    return c.json({ success: false, code: "BROADCAST_UNAVAILABLE" }, 503);
  }
  const { title, body, url, idempotencyKey } = parsed.data;
  const fingerprint = digest(JSON.stringify({ title, body, url: url ?? null }));
  const key = `gafus:admin:broadcast:dedup:${digest(`${actorId}:${idempotencyKey}`)}`;
  const inProgress: BroadcastMarker = { fingerprint, state: "IN_PROGRESS" };
  try {
    const acquired = await connection.set(
      key, JSON.stringify(inProgress), "EX", DEDUP_TTL_SECONDS, "NX",
    );
    if (acquired !== "OK") {
      const existing = await connection.get(key);
      if (!existing) return c.json({ success: false, code: "BROADCAST_ALREADY_ATTEMPTED" }, 409);
      let marker: BroadcastMarker;
      try { marker = JSON.parse(existing) as BroadcastMarker; }
      catch { return c.json({ success: false, code: "BROADCAST_ALREADY_ATTEMPTED" }, 409); }
      if (marker.fingerprint !== fingerprint) {
        return c.json({ success: false, code: "IDEMPOTENCY_KEY_CONFLICT" }, 409);
      }
      if (marker.state === "SUCCEEDED" && marker.data) {
        return c.json({ success: true, data: marker.data, replayed: true });
      }
      // In progress, interrupted, or partially sent: never resend automatically.
      return c.json({ success: false, code: "BROADCAST_ALREADY_ATTEMPTED" }, 409);
    }
  } catch {
    // Without a shared deduplication store, dispatch would risk duplicate messages.
    return c.json({ success: false, code: "BROADCAST_DEDUP_UNAVAILABLE" }, 503);
  }
  try {
    const data = await sendBroadcastPush(title, body, url);
    const summary = {
      totalUsers: data.totalUsers, sentCount: data.sentCount, failedCount: data.failedCount,
    };
    const marker: BroadcastMarker = {
      fingerprint, state: data.success ? "SUCCEEDED" : "UNKNOWN", data: summary,
    };
    // If Redis goes away now, the initial marker remains. Never release it on failure.
    await connection.set(key, JSON.stringify(marker), "EX", DEDUP_TTL_SECONDS);
    if (!data.success) return c.json({ success: false, code: "BROADCAST_FAILED", data: summary }, 503);
    return c.json({ success: true, data: summary });
  } catch {
    // A provider call may already have delivered some messages. Fail closed.
    return c.json({ success: false, code: "BROADCAST_OUTCOME_UNKNOWN" }, 503);
  }
});

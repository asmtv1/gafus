import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getUserSubscriptionStatus,
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
} from "@gafus/core/services/subscriptions";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-subscriptions");
export const subscriptionsRoutes = new Hono();

const saveSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

const deleteSchema = z.object({
  endpoint: z.string().optional(),
  deleteAll: z.boolean().optional(),
});

subscriptionsRoutes.get("/push", async (c) => {
  try {
    const user = c.get("user");
    const result = await getUserSubscriptionStatus(user.id);
    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("GET push error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

subscriptionsRoutes.post("/push", zValidator("json", saveSchema), async (c) => {
  try {
    const user = c.get("user");
    const { endpoint, keys } = c.req.valid("json");
    await savePushSubscription({ userId: user.id, endpoint, keys });
    return c.json({ success: true });
  } catch (error) {
    logger.error("POST push error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

subscriptionsRoutes.delete("/push", zValidator("json", deleteSchema), async (c) => {
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    if (body.deleteAll) {
      await deleteAllPushSubscriptions(user.id);
    } else if (body.endpoint) {
      await deletePushSubscriptionByEndpoint(user.id, body.endpoint);
    } else {
      return c.json({ success: false, error: "Нужен endpoint или deleteAll: true" }, 400);
    }
    return c.json({ success: true });
  } catch (error) {
    logger.error("DELETE push error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});


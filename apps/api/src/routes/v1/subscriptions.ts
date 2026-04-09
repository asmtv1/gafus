import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getUserSubscriptionStatus,
  getPushSubscriptionStatusForEndpoints,
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

/** Те же правила endpoint, что при DELETE (Expo / https URL / непрозрачный RuStore). */
const deviceStatusSchema = z
  .object({
    endpoints: z.array(z.string().min(1).max(4096)).max(8),
  })
  .superRefine((data, ctx) => {
    data.endpoints.forEach((endpoint, i) => {
      if (endpoint.startsWith("ExponentPushToken[") || endpoint.startsWith("ExpoPushToken[")) {
        const expoOk =
          /^ExponentPushToken\[[^\]]+\]$/.test(endpoint) ||
          /^ExpoPushToken\[[^\]]+\]$/.test(endpoint);
        if (!expoOk) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Некорректный формат токена Expo",
            path: ["endpoints", i],
          });
        }
        return;
      }
      try {
        const parsed = new URL(endpoint);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "URL подписки должен быть http(s)",
            path: ["endpoints", i],
          });
        }
      } catch {
        // RuStore и другие не-URL токены
      }
    });
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

/** Статус подписки для текущего устройства (переданные endpoint'ы). */
subscriptionsRoutes.post(
  "/push/device-status",
  zValidator("json", deviceStatusSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { endpoints } = c.req.valid("json");
      const data = await getPushSubscriptionStatusForEndpoints(user.id, endpoints);
      return c.json({ success: true, data });
    } catch (error) {
      logger.error("POST push/device-status error", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
    }
  },
);

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


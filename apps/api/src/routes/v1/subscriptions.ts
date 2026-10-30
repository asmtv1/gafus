import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getUserSubscriptionStatus,
  getPushSubscriptionStatusForEndpoints,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
} from "@gafus/core/services/subscriptions";
import { createWebLogger } from "@gafus/logger";
import { getBrowserAccessToken } from "../../lib/browser-auth.js";
import { decodeJwt } from "jose";
import type { Context } from "hono";
// The shared Core dist is stale until AG4's serialized build gate. Import
// the AG1-owned security-critical source for this Hono route, not old dist.
import {
  savePushSubscription,
  PushEndpointOwnerConflictError,
  PushSessionStaleError,
} from "../../../../../packages/core/src/services/subscriptions/pushSubscriptionService.js";

const logger = createWebLogger("api-subscriptions");
export const subscriptionsRoutes = new Hono();

/** After parent authMiddleware has verified the EXACT JWT, derive the signed
 * epoch from that same credential, not from JSON or untrusted HTTP headers. */
function signedSessionAuthenticatedAt(c: Context): number | null {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : getBrowserAccessToken(c);
  if (!token) return null;
  try {
    const payload = decodeJwt(token);
    const at = typeof payload.authenticatedAt === "number"
      ? payload.authenticatedAt : (payload.iat ?? 0) * 1000;
    return Number.isSafeInteger(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

const saveSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
}).strict();

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

// Public portion of the server's WebPush VAPID pair (never the private key).
// Auth middleware applies to /subscriptions/*; no keys are bundled in Vite.
subscriptionsRoutes.get("/push/public-key", (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!publicKey || !/^[A-Za-z0-9_-]{80,120}$/.test(publicKey)) {
    return c.json({success:false,code:"WEB_PUSH_NOT_CONFIGURED",
      error:"Веб-уведомления пока не настроены"},503);
  }
  return c.json({success:true,data:{publicKey}});
});

subscriptionsRoutes.get("/push", async (c) => {
  try {
    const user = c.get("user");
    const result = await getUserSubscriptionStatus(user.id);
    return c.json({ success: true, data: result });
  } catch {
    logger.error("GET push failed", new Error("PUSH_OPERATION_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

subscriptionsRoutes.post("/push", zValidator("json", saveSchema), async (c) => {
  try {
    const user = c.get("user");
    const { endpoint, keys } = c.req.valid("json");
    const verifiedSessionAuthenticatedAtMs = signedSessionAuthenticatedAt(c);
    if (!verifiedSessionAuthenticatedAtMs) {
      return c.json({ success: false, code: "PUSH_SESSION_STALE" }, 401);
    }
    await savePushSubscription({
      userId: user.id, endpoint, keys, verifiedSessionAuthenticatedAtMs,
    });
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof PushEndpointOwnerConflictError) {
      return c.json({ success: false, code: error.code }, 409);
    }
    if (error instanceof PushSessionStaleError) {
      return c.json({ success: false, code: error.code }, 401);
    }
    logger.error("POST push failed", new Error("PUSH_OPERATION_FAILED"));
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
    } catch {
      logger.error("POST push/device-status failed", new Error("PUSH_OPERATION_FAILED"));
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
  } catch {
    logger.error("DELETE push failed", new Error("PUSH_OPERATION_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});


/**
 * Achievements Routes
 * Endpoints для работы с достижениями
 */
import { Hono } from "hono";

import { readAchievementsApplication } from "../../modules/achievements/composition/read-achievements.js";
import { getAppSubscriptionAccess } from "@gafus/core/services/appSubscription";
import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  getAppFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-achievements");

export const achievementsRoutes = new Hono();

// Account entitlements can expire/revoke between GETs. Never cache private stats.
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/** Identical feature-flag + current DB subscription snapshot as Next achievements. */
achievementsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  const owner = c.get("user")?.id;
  if (!owner) return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
  try {
    const gated = await getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true);
    if (gated) {
      // SELECT-only snapshot: NEVER reconcile YooKassa/Apple/payments on GET.
      const access = await getAppSubscriptionAccess(owner);
      if (!access.hasActiveSubscription) {
        return c.json({
          success: false, code: "SUBSCRIPTION_REQUIRED", error: "Для действия нужна подписка",
        }, 403);
      }
    }
  } catch {
    // Fail closed. Never log private subscription/payment details or access errors.
    return c.json({ success: false, code: "ACHIEVEMENTS_ACCESS_CHECK_FAILED" }, 503);
  }
  await next();
  c.header("Cache-Control", "private, no-store");
});

// ==================== GET /achievements/training-dates ====================
achievementsRoutes.get("/training-dates", async (c) => {
  try {
    const user = c.get("user");
    const dates = await readAchievementsApplication.trainingDates({ actorUserId: user.id });
    const datesAsStrings = dates.map((d) => d.toISOString());

    return c.json({ success: true, data: { dates: datesAsStrings } }, { headers: PRIVATE_HEADERS });
  } catch {
    // Do not log raw clinical/training/session details or provider error payloads.
    logger.error("Achievements training-dates GET failed");
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /achievements ====================
achievementsRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const data = await readAchievementsApplication.stats({ actorUserId: user.id });
    return c.json({ success: true, data }, { headers: PRIVATE_HEADERS });
  } catch {
    logger.error("Achievements stats GET failed");
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

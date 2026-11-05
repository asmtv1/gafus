import { Hono } from "hono";
import { z } from "zod/v3";
import { readAdminActorRole } from "@gafus/core/services/adminUser";
import {
  getMobileReleaseControl,
  updateMobileReleaseControl,
  MobileReleaseControlConflictError,
} from "@gafus/core/services/appFeatureFlags";
import { requireRole } from "../../middleware/auth.js";

export const adminFeatureFlagsRoutes = new Hono();
adminFeatureFlagsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const features = z.object({
  vkLogin: z.boolean(), iosRuCardPayment: z.boolean(), subscriptionPromoCodes: z.boolean(),
  iosRuCardPaymentHint: z.boolean(), rewardedAds: z.boolean(),
}).strict();
const payload = z.object({
  revision: z.number().int().positive(),
  iosReviewVersion: z.string().trim().regex(/^\d+\.\d+\.\d+$/).nullable(),
  ota: z.object({
    required: z.boolean(),
    version: z.string().trim().regex(/^\d+\.\d+\.\d+-ota\.[1-9]\d*$/).nullable(),
    platform: z.enum(["all", "ios", "android"]),
  }).strict().refine(v => !v.required || v.version !== null, "Укажите OTA-версию"),
  released: features, review: features,
  global: z.object({
    appSubscriptionPaywall: z.boolean(), appSubscriptionGating: z.boolean(),
  }).strict(),
  rewardedAds: z.object({
    androidEnabled: z.boolean(), dailyAdLimit: z.number().int().min(0).max(100),
    yandexAndroidPlacementId: z.string().trim().max(256).nullable(),
    yandexIosPlacementId: z.string().trim().max(256).nullable(),
    testMode: z.boolean(),
  }).strict(),
}).strict();

async function currentRole(userId: string) {
  return readAdminActorRole(userId);
}

adminFeatureFlagsRoutes.get("/", requireRole("ADMIN", "MODERATOR"), async c => {
  try {
    const role = await currentRole(c.get("user").id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    return c.json({ success: true, data: await getMobileReleaseControl() });
  } catch {
    return c.json({ success: false, code: "FEATURE_FLAGS_UNAVAILABLE" }, 503);
  }
});

adminFeatureFlagsRoutes.put("/", requireRole("ADMIN"), async c => {
  let input: z.infer<typeof payload>;
  try {
    input = payload.parse(await c.req.json());
  } catch {
    return c.json({ success: false, code: "FEATURE_FLAGS_VALIDATION_ERROR" }, 400);
  }
  try {
    const actorId = c.get("user").id;
    if (await currentRole(actorId) !== "ADMIN") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    // Rewarded ads were retired by the GAFUS refactor decision. Preserve historical
    // values for legacy clients, but never permit activating or mutating this archive.
    const current = await getMobileReleaseControl();
    if (
      input.released.rewardedAds !== current.released.rewardedAds ||
      input.review.rewardedAds !== current.review.rewardedAds ||
      Object.keys(input.rewardedAds).some(key =>
        input.rewardedAds[key as keyof typeof input.rewardedAds] !==
        current.rewardedAds[key as keyof typeof current.rewardedAds]
      )
    ) {
      return c.json({ success: false, code: "RETIRED_REWARDED_ADS_READ_ONLY" }, 409);
    }
    const data = await updateMobileReleaseControl(input, actorId);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof MobileReleaseControlConflictError) {
      return c.json({ success: false, code: "STALE_CONFIG" }, 409);
    }
    if (error && typeof error === "object" && "code" in error &&
      error.code === "RETIRED_REWARDED_ADS_READ_ONLY") {
      return c.json({ success: false, code: "RETIRED_REWARDED_ADS_READ_ONLY" }, 409);
    }
    return c.json({ success: false, code: "FEATURE_FLAGS_UPDATE_FAILED" }, 500);
  }
});

import { internalFeedRoutes } from "./routes/internal/feed.js";
import { internalChat2MediaJobRoutes } from "./routes/internal/chat2-media-jobs.js";
import { internalQuestionsMediaJobRoutes } from "./routes/internal/questions-media-jobs.js";
import { questionsRoutes } from "./routes/v1/questions.js";
import { gafusRoutes } from "./routes/v1/gafus.js";
import { gafusAdminRoutes } from "./routes/v1/gafus-admin.js";
import { galleryRoutes } from "./routes/v1/gallery.js";
import { galleryCdnRedirectResponse } from "@gafus/gallery-server";
import { feedRoutes } from "./routes/v1/feed.js";
import { internalGalleryRoutes } from "./routes/internal/gallery.js";
import { chatsRoutes } from "./routes/v1/chats.js";
/**
 * Hono App Setup
 * Конфигурация middleware и маршрутов
 */
import { Hono, type Context } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";

import { authRateLimitScope } from "./middleware/auth-rate-policy.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";
import {
  authRateLimiter,
  authSessionRateLimiter,
  apiRateLimiter,
  galleryRateLimiter,
  paymentsRateLimiter,
  usernameAvailableRateLimiter,
} from "./middleware/rate-limit.js";
import { healthRoutes } from "./routes/v1/health.js";
import { chat2CanRetireLegacy } from "./lib/chat2-legacy-retirement.js";
import { authRoutes, usernamePrivateResponse } from "./routes/v1/auth.js";
import { webVkRoutes } from "./routes/v1/auth-vk-web.js";
import { userRoutes } from "./routes/v1/user.js";
import { articlesRoutes } from "./routes/v1/articles.js";
import { coursesRoutes } from "./routes/v1/courses.js";
import { trainerStatisticsRoutes } from "./routes/v1/trainer-statistics.js";
import { trainerCoursesRoutes } from "./routes/v1/trainer-courses.js";
import { trainerStepsRoutes } from "./routes/v1/trainer-steps.js";
import { trainerAuthoringRoutes } from "./routes/v1/trainer-authoring.js";
import { trainerTemplatesRoutes } from "./routes/v1/trainer-templates.js";
import { trainerDailyBundlesRoutes } from "./routes/v1/trainer-daily-bundles.js";
import { trainerDailyStatisticsRoutes } from "./routes/v1/trainer-daily-statistics.js";
import { trainerDailyManageRoutes } from "./routes/v1/trainer-daily-manage.js";
import { trainerDaysRoutes } from "./routes/v1/trainer-days.js";
import { trainerExamSummaryRoutes } from "./routes/v1/trainer-exam-summary.js";
import { trainerExamManageRoutes } from "./routes/v1/trainer-exam-manage.js";
import { trainerNotesSummaryRoutes } from "./routes/v1/trainer-notes-summary.js";
import { trainerNotesManageRoutes } from "./routes/v1/trainer-notes-manage.js";
import { trainerStepManageRoutes, trainerDayManageRoutes } from "./routes/v1/trainer-content-manage.js";
import { trainerFullCourseRoutes } from "./routes/v1/trainer-course-full-manage.js";
import { trainerVideosManageRoutes } from "./routes/v1/trainer-videos-manage.js";
import { trainerArticlesOwnSummaryRoutes } from "./routes/v1/trainer-articles-own-summary.js";
import { trainerArticlesManageRoutes } from "./routes/v1/trainer-articles-manage.js";
import { trainerVideosMetadataRoutes } from "./routes/v1/trainer-videos-metadata.js";
import { petsRoutes } from "./routes/v1/pets.js";
import { petPreventionRoutes } from "./routes/v1/pet-prevention.js";
import { petVetVisitRoutes } from "./routes/v1/pet-vet-visits.js";
import { trainingRoutes } from "./routes/v1/training.js";
import { dailyCourseRoutes } from "./routes/v1/daily-course.js";
import { examRoutes } from "./routes/v1/exam.js";
import { surveysRoutes } from "./routes/v1/surveys.js";
import { offlineRoutes } from "./routes/v1/offline.js";
import { achievementsRoutes } from "./routes/v1/achievements.js";
import { subscriptionsRoutes } from "./routes/v1/subscriptions.js";
import { notesRoutes } from "./routes/v1/notes.js";
import { remindersRoutes } from "./routes/v1/reminders.js";
import { paymentsRoutes } from "./routes/v1/payments.js";
import { paymentProviderWebhooks } from "./routes/v1/payment-provider-webhooks.js";
import { publicMobileRoutes } from "./routes/v1/public-mobile.js";
import { publicPaidCourseOutlineRoutes } from "./routes/v1/public-paid-course-outline.js";
import { publicStatsRoutes } from "./routes/v1/public-stats.js";
import { mediaDeliveryRoutes } from "./routes/v1/media-delivery.js";
import { mediaCdnProbeRoutes } from "./routes/v1/media-cdn-probe.js";
import { adminMediaRoutes } from "./routes/v1/admin-media.js";
import { adminPartnerRoutes } from "./routes/v1/admin-partners.js";
import { adminUsersRoutes } from "./routes/v1/admin-users.js";
import { adminFeatureFlagsRoutes } from "./routes/v1/admin-feature-flags.js";
import { adminMailRoutes } from "./routes/v1/admin-mail.js";
import { adminAnalyticsRoutes } from "./routes/v1/admin-analytics.js";
import { adminProfitRoutes } from "./routes/v1/admin-profit.js";
import { adminModerationRoutes } from "./routes/v1/admin-moderation.js";
import { adminSubscriptionRoutes } from "./routes/v1/admin-subscriptions.js";
import { adminBroadcastRoutes } from "./routes/v1/admin-broadcasts.js";
import { adminSettingsRoutes } from "./routes/v1/admin-settings.js";
import { adminConsultationScheduleRoutes } from "./routes/v1/admin-consultation-schedules.js";
import { adminGafusOperationsRoutes } from "./routes/v1/admin-gafus-operations.js";
import { adminReengagementTriggerRoutes } from "./routes/v1/admin-reengagement-trigger.js";
import { adminCacheRoutes } from "./routes/v1/admin-cache.js";
import { consultationsRoutes } from "./routes/v1/consultations.js";
import { appSubscriptionRoutes } from "./routes/v1/app-subscription.js";
import { appleTokenInitializationReviewRoutes } from "./routes/v1/g1-apple-token-initialization.review.js";
import { rewardedAdsRoutes } from "./routes/v1/rewarded-ads.js";
import { partnersRoutes } from "./routes/v1/partners.js";
import { mobileIntroRoutes } from "./routes/v1/mobile-intro.js";
import { shouldRateLimitAppSubscriptionPath } from "./middleware/app-subscription-rate-limit.js";

export const app = new Hono();

// Global middleware
app.use("*", requestId());
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", corsMiddleware);

// Beget CDN private Gallery origin: guarded, off by default, zero photo-byte proxying.
// CDN strips its own /md5(...) viewer token before requesting these exact S3 keys.
for (const path of ["/albums/*", "/users/*", "/gallery/*"]) {
  app.on(["GET", "HEAD"], path, c => galleryCdnRedirectResponse(c.req.raw));
}

// Health routes (no auth)
app.route("/", healthRoutes);

// Публичная конфигурация мобильного приложения (без JWT)
app.use("/api/v1/public/*", apiRateLimiter);
app.route("/api/v1/public", publicMobileRoutes);
app.route("/api/v1/public/paid-course-outline", publicPaidCourseOutlineRoutes);
app.route("/api/v1/public/platform-stats", publicStatsRoutes);
app.use("/api/v1/media-delivery/*", apiRateLimiter);
app.route("/api/v1/media-delivery", mediaDeliveryRoutes);
// Restore authenticated, rate-limited, no-store CDN status proxy for Web media fallback.
app.use("/api/v1/media-cdn-probe", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Cookie");
  await next();
});
app.use("/api/v1/media-cdn-probe", authMiddleware, apiRateLimiter);
app.route("/api/v1/media-cdn-probe", mediaCdnProbeRoutes);

// Read-only admin media statistics: keep private headers even on early auth/429.
app.use("/api/v1/admin/media/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
app.use("/api/v1/admin/media/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/media", adminMediaRoutes);

// Financial admin read/write requests are actor-derived and never publicly cacheable.
const adminPartnersPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/partners", adminPartnersPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/partners/*", adminPartnersPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/partners", adminPartnerRoutes);

const adminUsersPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/users", adminUsersPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/users/*", adminUsersPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/users", adminUsersRoutes);

const adminFlagsPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/feature-flags", adminFlagsPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/feature-flags/*", adminFlagsPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/feature-flags", adminFeatureFlagsRoutes);

const adminMailPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/mail", adminMailPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/mail/*", adminMailPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/mail", adminMailRoutes);

app.use("/api/v1/admin/analytics/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
app.use("/api/v1/admin/analytics/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/analytics", adminAnalyticsRoutes);
app.use("/api/v1/admin/reengagement/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
app.use("/api/v1/admin/reengagement/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/reengagement", adminReengagementTriggerRoutes);
app.use("/api/v1/admin/cache", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
app.use("/api/v1/admin/cache/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
app.use("/api/v1/admin/cache", authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/cache/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/cache", adminCacheRoutes);

const adminProfitPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/profit", adminProfitPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/profit/*", adminProfitPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/profit", adminProfitRoutes);

app.use("/api/v1/admin/moderation/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
app.use("/api/v1/admin/moderation/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/moderation", adminModerationRoutes);

const adminSubscriptionPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/app-subscriptions", adminSubscriptionPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/app-subscriptions/*", adminSubscriptionPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/app-subscriptions", adminSubscriptionRoutes);

const adminBroadcastPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/broadcasts", adminBroadcastPrivate, authMiddleware, apiRateLimiter);
app.use("/api/v1/admin/broadcasts/*", adminBroadcastPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/broadcasts", adminBroadcastRoutes);

app.use("/api/v1/admin/settings/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});
app.use("/api/v1/admin/settings/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/settings", adminSettingsRoutes);

const adminSchedulesPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/consultations/schedules/*", adminSchedulesPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/consultations/schedules", adminConsultationScheduleRoutes);

const adminGafusPrivate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/admin/gafus-operations/*", adminGafusPrivate, authMiddleware, apiRateLimiter);
app.route("/api/v1/admin/gafus-operations", adminGafusOperationsRoutes);

// Auth routes (rate limited) — GET username-available получает мягкий лимит
// G03 private response headers must precede the Redis limiter (including 429).
app.use("/api/v1/auth/username-available", usernamePrivateResponse);
app.use("/api/v1/auth/username-change", usernamePrivateResponse);
app.use("/api/v1/auth/*", (c, next) => {
  const scope = authRateLimitScope(new URL(c.req.url).pathname, c.req.method);
  if (scope === "availability") return usernameAvailableRateLimiter(c, next);
  if (scope === "identity") return apiRateLimiter(c, next);
  if (scope === "session") return authSessionRateLimiter(c, next);
  // Password-changing and unauthenticated credential flows retain the strict
  // 10 attempts / 15 minutes quota, independent of refresh/logout traffic.
  return authRateLimiter(c, next);
});
app.route("/api/v1/auth/vk-web", webVkRoutes);
app.route("/api/v1/auth", authRoutes);

app.use("/api/v1/mobile-intro/events", apiRateLimiter);
app.use("/api/v1/mobile-intro/auth-outcome", authMiddleware, apiRateLimiter);
app.use("/api/v1/mobile-intro/admin/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/mobile-intro", mobileIntroRoutes);

// Old Stream chat endpoints are intentionally retired. Never fall back to
// the old provider or mutate legacy conversations during the Chat2 cutover.
const retiredChat = async (c: Context) => {
  c.header("Cache-Control", "no-store");
  if (!(await chat2CanRetireLegacy()))
    return c.json({ success: false, code: "CHAT2_CUTOVER_NOT_READY",
      error: "Сообщения временно недоступны" }, 503);
  return c.json({ success: false, code: "LEGACY_CHAT_RETIRED",
    error: "Используйте Сообщения (Chat 2.0)" }, 410);
};
for (const route of ["/api/v1/cynologist-chat", "/api/v1/community-chat",
  "/api/v1/stream-chat/webhook"]) {
  app.all(route, retiredChat);
  app.all(`${route}/*`, retiredChat);
}
// Chat 2.0 remains dark by default until the isolated Refactor environment is configured.
// Never accidentally expose a partially migrated messenger in another deployment.
const chat2Gate = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  if(process.env.CHAT2_API_ENABLED!=="enabled")
    return c.json({success:false,code:"CHAT2_DISABLED",error:"Новый чат ещё не включён"},503);
  await next();
};
app.use("/api/v1/chats", chat2Gate);
app.use("/api/v1/chats/*", chat2Gate);
app.use("/api/v1/chats", authMiddleware, apiRateLimiter);
app.use("/api/v1/chats/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/chats", chatsRoutes);
app.use("/api/v1/questions", authMiddleware, apiRateLimiter);
app.use("/api/v1/questions/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/questions", questionsRoutes);
// VET/WALLET AG4 REVIEW ONLY: private no-store *before* 401/429 from middleware.
// This is additive response-header policy; does not weaken cookie Origin or JWT.
const ownerPrivateRead = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store, max-age=0");
};
app.use("/api/v1/gafus", ownerPrivateRead, authMiddleware, apiRateLimiter);
app.use("/api/v1/gafus/*", ownerPrivateRead, authMiddleware, apiRateLimiter);
app.route("/api/v1/gafus", gafusRoutes);
app.route("/api/v1/gafus/admin", gafusAdminRoutes);
const galleryNoStore = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "no-store");
  await next();
};
app.use("/api/v1/gallery", galleryNoStore, authMiddleware, galleryRateLimiter);
app.use("/api/v1/gallery/*", galleryNoStore, authMiddleware, galleryRateLimiter);
app.route("/api/v1/gallery", galleryRoutes);
app.use("/api/v1/feed", galleryNoStore, authMiddleware, apiRateLimiter);
app.use("/api/v1/feed/*", galleryNoStore, authMiddleware, apiRateLimiter);
app.route("/api/v1/feed", feedRoutes);
// Internal cloud callbacks authenticate each raw request with HMAC and Redis-backed nonce replay protection.
app.route("/internal/gallery", internalGalleryRoutes);
app.route("/internal/feed", internalFeedRoutes);
app.route("/internal/chat2/media/jobs", internalChat2MediaJobRoutes);
app.route("/internal/questions/media/jobs", internalQuestionsMediaJobRoutes);

// Protected routes - require auth
// Only /user/profile needs actor-private headers; /profile/public stays public.
// Set before rate limiting and authentication, including early 401/403/429.
const profilePrivateNoStore = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/user/profile", profilePrivateNoStore);
app.use("/api/v1/user/*", apiRateLimiter);
app.use("/api/v1/user/*", authMiddleware);
app.route("/api/v1/user", userRoutes);

// Authenticated article errors must be no-store even when Redis rate limiting
// or JWT/Origin verification rejects before the route module executes.
const articlePrivateNoStore = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/articles", articlePrivateNoStore);
app.use("/api/v1/articles/*", articlePrivateNoStore, apiRateLimiter);
app.use("/api/v1/articles/*", authMiddleware);
app.route("/api/v1/articles", articlesRoutes);

app.use("/api/v1/courses/*", apiRateLimiter);
app.use("/api/v1/courses/*", authMiddleware);
app.route("/api/v1/courses", coursesRoutes);

// AG4-TR-012 approved draft GET only. Keep privacy before JWT and early 429.
app.use("/api/v1/trainer/courses/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  // This scoped contract requires machine-readable early errors; shared
  // auth/rate middleware intentionally have different response shapes.
  if (c.req.method === "GET" && (c.res.status === 401 || c.res.status === 429)) {
    const previous = c.res;
    let code: "UNAUTHORIZED" | "RATE_LIMITED" | null =
      previous.status === 429 ? "RATE_LIMITED" : "UNAUTHORIZED";
    if (previous.status === 401) {
      const body: unknown = await previous.clone().json().catch(() => null);
      if (body && typeof body === "object" && "code" in body &&
          body.code === "REGISTRATION_PENDING") code = null;
    }
    if (code) {
      const headers = new Headers(previous.headers);
      headers.set("Content-Type", "application/json; charset=utf-8");
      c.res = new Response(JSON.stringify({
        success: false, code,
        error: code === "UNAUTHORIZED" ? "Не авторизован" : "Слишком много запросов",
      }), { status: previous.status, headers });
    }
  }
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
});
app.use("/api/v1/trainer/courses/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/courses", trainerCoursesRoutes);
app.route("/api/v1/trainer/courses/manage", trainerFullCourseRoutes);

// AG4-approved scoped TR018: private even on pre-auth 401 and early Redis 429.
// Limiter remains the existing shared API limiter; JWT actor is server verified.
app.use("/api/v1/trainer/statistics/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
});
app.use("/api/v1/trainer/statistics/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/statistics", trainerStatisticsRoutes);

// AG4 TR013 frozen read-only visibility: privacy precedes auth and limiter.
// Normalize only 401/429 from this GET's shared middleware to contract codes.
const trainerStepsPrivateRead = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  if (c.req.method === "GET" && (c.res.status === 401 || c.res.status === 429)) {
    const previous = c.res;
    let code: "UNAUTHORIZED" | "RATE_LIMITED" | null =
      previous.status === 429 ? "RATE_LIMITED" : "UNAUTHORIZED";
    if (previous.status === 401) {
      const body: unknown = await previous.clone().json().catch(() => null);
      if (body && typeof body === "object" && "code" in body &&
          body.code === "REGISTRATION_PENDING") code = null;
    }
    if (code) {
      const headers = new Headers(previous.headers);
      headers.set("Content-Type", "application/json; charset=utf-8");
      c.res = new Response(JSON.stringify({
        success: false, code,
        error: code === "UNAUTHORIZED" ? "Не авторизован" : "Слишком много запросов",
      }), { status: previous.status, headers });
    }
  }
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
};
app.use("/api/v1/trainer/steps", trainerStepsPrivateRead);
app.use("/api/v1/trainer/steps/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/steps", authMiddleware, apiRateLimiter);
app.use("/api/v1/trainer/steps/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/steps", trainerStepsRoutes);
app.route("/api/v1/trainer/steps/manage", trainerStepManageRoutes);

// Trainer form POSTs: same private/JWT/rate boundary as legacy trainer reads.
// Never trust an author ID in a JSON payload, deny moderator writes.
app.use("/api/v1/trainer/authoring/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/authoring/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/authoring", trainerAuthoringRoutes);

// AG4(v5) TR013: only public-template GET, still trainer-panel authenticated.
// Identical response privacy and early 401/429 normalization as visible steps.
app.use("/api/v1/trainer/templates", trainerStepsPrivateRead);
app.use("/api/v1/trainer/templates/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/templates", authMiddleware, apiRateLimiter);
app.use("/api/v1/trainer/templates/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/templates", trainerTemplatesRoutes);

// AG4 TR014 frozen single read; reuse existing private 401/429 normalization.
// Authenticated JWT actor is the only source of author/elevated privileges.
app.use("/api/v1/trainer/daily-course/bundles", trainerStepsPrivateRead);
app.use("/api/v1/trainer/daily-course/bundles", authMiddleware, apiRateLimiter);
// Continuation130: same session/policy/private middleware as TR014 bundles.
app.use("/api/v1/trainer/daily-course/bundle-step-candidates", trainerStepsPrivateRead);
app.use("/api/v1/trainer/daily-course/bundle-step-candidates", authMiddleware, apiRateLimiter);
// Continuation131: same private preauth/limiter for bounded schedule GET.
app.use("/api/v1/trainer/daily-course/schedule-range", trainerStepsPrivateRead);
app.use("/api/v1/trainer/daily-course/schedule-range", authMiddleware, apiRateLimiter);
// AG1 cont132: same protected read boundary for existing calendar candidate list.
app.use("/api/v1/trainer/daily-course/candidates", trainerStepsPrivateRead);
app.use("/api/v1/trainer/daily-course/candidates", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/daily-course", trainerDailyBundlesRoutes);
// Read-only full daily-course statistics, including selected learner details.
app.use("/api/v1/trainer/daily-course/statistics", trainerStepsPrivateRead);
app.use("/api/v1/trainer/daily-course/statistics", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/daily-course/statistics", trainerDailyStatisticsRoutes);
// Mutations own distinct explicit path; no blanket write enablement on readonly GETs.
app.use("/api/v1/trainer/daily-course/manage/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/daily-course/manage/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/daily-course/manage", trainerDailyManageRoutes);

// AG4 frozen visible-days GET: private headers also on pre-auth and early 429.
// No client owner override, day mutation or legacy Next route changes.
app.use("/api/v1/trainer/days", trainerStepsPrivateRead);
app.use("/api/v1/trainer/days/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/days", authMiddleware, apiRateLimiter);
app.use("/api/v1/trainer/days/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/days", trainerDaysRoutes);
app.route("/api/v1/trainer/days/manage", trainerDayManageRoutes);

// AG1 cont137: PRIVACY BEFORE auth and limiter, one trainer exam SUMMARY GET.
app.use("/api/v1/trainer/exam-results/summary", trainerStepsPrivateRead);
app.use("/api/v1/trainer/exam-results/summary", authMiddleware, apiRateLimiter);
// AG1 cont138: same preauth private/no-store and JWT+limiter boundary.
app.use("/api/v1/trainer/exam-results/pending-summary", trainerStepsPrivateRead);
app.use("/api/v1/trainer/exam-results/pending-summary", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/exam-results", trainerExamSummaryRoutes);

// Full owner-scoped review workflow: private headers before JWT and rate limiter.
app.use("/api/v1/trainer/exam-results/manage", trainerStepsPrivateRead);
app.use("/api/v1/trainer/exam-results/manage/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/exam-results/manage", authMiddleware, apiRateLimiter);
app.use("/api/v1/trainer/exam-results/manage/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/exam-results/manage", trainerExamManageRoutes);

// AG1 cont139: strict private summary; no notes entry/student SELECT or writes.
app.use("/api/v1/trainer/notes/summary", trainerStepsPrivateRead);
app.use("/api/v1/trainer/notes/summary", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/notes", trainerNotesSummaryRoutes);

// Full owner-scoped note CRUD; private/no-store before auth and rate limiter.
app.use("/api/v1/trainer/notes/manage", trainerStepsPrivateRead);
app.use("/api/v1/trainer/notes/manage/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/notes/manage", authMiddleware, apiRateLimiter);
app.use("/api/v1/trainer/notes/manage/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/notes/manage", trainerNotesManageRoutes);

// AG1 cont144: metadata-only own articles, private headers before auth/rate limit.
app.use("/api/v1/trainer/articles/own-summary", trainerStepsPrivateRead);
app.use("/api/v1/trainer/articles/own-summary", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/articles", trainerArticlesOwnSummaryRoutes);

// Article body/owner CRUD. Keep authorization at both boundary and Core level.
app.use("/api/v1/trainer/articles/manage/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/articles/manage/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/articles/manage", trainerArticlesManageRoutes);

// AG1 cont146: trainer-own/admin-all video metadata without media/provider fields.
app.use("/api/v1/trainer/videos/metadata", trainerStepsPrivateRead);
app.use("/api/v1/trainer/videos/metadata", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/videos", trainerVideosMetadataRoutes);
app.use("/api/v1/trainer/videos/manage/*", trainerStepsPrivateRead);
app.use("/api/v1/trainer/videos/manage/*", authMiddleware, apiRateLimiter);
app.route("/api/v1/trainer/videos/manage", trainerVideosManageRoutes);

app.use("/api/v1/pets/*", ownerPrivateRead, apiRateLimiter);
app.use("/api/v1/pets/*", authMiddleware);
app.route("/api/v1/pets", petsRoutes);
app.route("/api/v1/pets", petPreventionRoutes);
app.route("/api/v1/pets", petVetVisitRoutes);

// Training routes - большинство требуют JWT
// authMiddleware пропускает маршруты /video/:videoId/manifest и /video/:videoId/segment
app.use("/api/v1/training/*", apiRateLimiter);
app.use("/api/v1/training/*", authMiddleware);
app.route("/api/v1/training", trainingRoutes);

app.use("/api/v1/daily-course/*", apiRateLimiter);
app.use("/api/v1/daily-course/*", authMiddleware);
app.route("/api/v1/daily-course", dailyCourseRoutes);

app.use("/api/v1/exam/*", apiRateLimiter);
app.use("/api/v1/exam/*", authMiddleware);
app.route("/api/v1/exam", examRoutes);

app.use("/api/v1/surveys/*", apiRateLimiter);
app.use("/api/v1/surveys/*", authMiddleware);
app.route("/api/v1/surveys", surveysRoutes);

app.use("/api/v1/offline/*", apiRateLimiter);
app.use("/api/v1/offline/*", authMiddleware);
app.route("/api/v1/offline", offlineRoutes);

// AG1 Achievements privacy review only: before limiter/JWT 401/429.
// Existing Redis limiter remains unchanged: do not bypass it in production.
const achievementPrivateNoStore = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
};
app.use("/api/v1/achievements", achievementPrivateNoStore);
app.use("/api/v1/achievements/*", achievementPrivateNoStore, apiRateLimiter);
app.use("/api/v1/achievements/*", authMiddleware);
app.route("/api/v1/achievements", achievementsRoutes);

app.use("/api/v1/subscriptions/*", apiRateLimiter);
app.use("/api/v1/subscriptions/*", authMiddleware);
app.route("/api/v1/subscriptions", subscriptionsRoutes);

app.use("/api/v1/notes/*", apiRateLimiter);
app.use("/api/v1/notes/*", authMiddleware);
app.route("/api/v1/notes", notesRoutes);

// AG4 review: private even if auth/rate-limiter rejects before the route.
app.use("/api/v1/reminders/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
app.use("/api/v1/reminders/*", apiRateLimiter);
app.use("/api/v1/reminders/*", authMiddleware);
app.route("/api/v1/reminders", remindersRoutes);

// Public signed/provider-verified callback before private legacy payment routes.
app.route("/", paymentProviderWebhooks);
app.use("/api/v1/payments/*", authMiddleware);
app.use("/api/v1/payments/create", paymentsRateLimiter);
app.use("/api/v1/payments/apple/verify", paymentsRateLimiter);
app.route("/api/v1/payments", paymentsRoutes);

// Lost-ACK booking lookup is private even when global auth or rate-limit rejects
// BEFORE the consultation router can run its own response-header middleware.
app.use("/api/v1/consultations/book/lookup", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
app.use("/api/v1/consultations/*", apiRateLimiter);
app.use("/api/v1/consultations/*", authMiddleware);
app.route("/api/v1/consultations", consultationsRoutes);

// Private status/offer (and all payment mutation responses) must be no-store,
// including 401 and rate-limited responses emitted before route handlers.
// Apple signed notifications are registered with the public provider routes above.
app.use("/api/v1/app-subscription/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
app.use("/api/v1/app-subscription/*", authMiddleware);
app.use("/api/v1/app-subscription/*", (c, next) => {
  const { pathname } = new URL(c.req.url);
  if (shouldRateLimitAppSubscriptionPath(c.req.method, pathname)) {
    return paymentsRateLimiter(c, next);
  }
  return next();
});
app.route("/api/v1/app-subscription", appSubscriptionRoutes);
// AG4 Phase A: opt-in Apple init, legacy GET /offer unchanged.
app.route("/api/v1/app-subscription", appleTokenInitializationReviewRoutes);

app.use("/api/v1/rewarded-ads/*", authMiddleware);
app.use("/api/v1/rewarded-ads/*", (c, next) => {
  const { pathname } = new URL(c.req.url);
  if (c.req.method === "POST" && (pathname.endsWith("/session") || pathname.endsWith("/grant"))) {
    return paymentsRateLimiter(c, next);
  }
  return apiRateLimiter(c, next);
});
app.route("/api/v1/rewarded-ads", rewardedAdsRoutes);

// ECON060 partner balance/profile is actor-private, even on early JWT/Redis failure.
app.use("/api/v1/partners/me", async (c, next) => {
  if (c.req.method !== "GET") return next();
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
});
app.use("/api/v1/partners/*", apiRateLimiter);
app.use("/api/v1/partners/*", authMiddleware);
app.route("/api/v1/partners", partnersRoutes);

// Global error handler
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: "Endpoint не найден" }, 404);
});

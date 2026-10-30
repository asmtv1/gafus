/**
 * Gallery V2 local-only E2E HTTP server: real registered Hono route handlers,
 * cookie auth, exact dedicated empty DB, disposable S3 and private Redis.
 * Never start via production API entrypoint or allow non-loopback resources.
 */
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const DB = "postgresql://asmtv1@127.0.0.1:5432/gafus_gallery_v2_test_20261028";
const exact = {
  DATABASE_URL: DB,
  REDIS_URL: "redis://127.0.0.1:55927/1",
  NODE_ENV: "development",
  GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_LOCAL_BROWSER_AUTH: "1",
  GAFUS_GALLERY_ISOLATED_HONO: "1",
  GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE: "1",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
  GALLERY_ENABLED: "true",
  FEED_ENABLED: "false",
  CLOUDRU_MEDIA_JOBS_ENABLED: "false",
  GALLERY_MEDIA_FALLBACK_ENABLED: "false",
  FEED_MEDIA_FALLBACK_ENABLED: "false",
  CDN_HEALTH_MONITOR_ENABLED: "false",
  API_HOST: "127.0.0.1",
  API_PORT: "3601",
} as const;

if (realpathSync(process.cwd()) !== ROOT + "/apps/api") throw Error("ISOLATED_HTTP_ROOT_DENIED");
for (const [key, value] of Object.entries(exact))
  if (process.env[key] !== value) throw Error("ISOLATED_HTTP_ENV_DENIED_" + key);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    !process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32)
  throw Error("ISOLATED_HTTP_SIGNING_DENIED");
if (Object.keys(process.env).some(key =>
  /^(?:CLOUD_RU_|CLOUDRU_S3_|AWS_|YOOKASSA_|RESEND_|SMTP_|MAIL_|BEGET_)/.test(key) &&
  process.env[key])) throw Error("ISOLATED_HTTP_PROVIDER_ENV_DENIED");

// Dynamically import AFTER all gates; importing the usual server entrypoint
// would enforce the legacy WORK port and risk a different DB.
const [
  { Hono }, { serve }, { prisma }, { connection: redis },
  { corsMiddleware }, { authMiddleware },
  { authRoutes }, { userRoutes }, { galleryRoutes },
  { apiRateLimiter, galleryRateLimiter, authRateLimiter, authSessionRateLimiter },
  { authRateLimitScope }, { errorHandler },
] = await Promise.all([
  import("hono"),
  import("@hono/node-server"),
  import("@gafus/prisma"),
  import("@gafus/queues"),
  import("../middleware/cors.js"),
  import("../middleware/auth.js"),
  import("../routes/v1/auth.js"),
  import("../routes/v1/user.js"),
  import("../routes/v1/gallery.js"),
  import("../middleware/rate-limit.js"),
  import("../middleware/auth-rate-policy.js"),
  import("../middleware/error-handler.js"),
]);
// Mount exactly the production handlers and their authentication/rate-limiting
// middleware; omit unrelated broken Question/Feed server bundle imports.
const app = new Hono();
app.use("*", corsMiddleware);
app.use("/api/v1/auth/*", (c, next) => {
  const scope = authRateLimitScope(new URL(c.req.url).pathname, c.req.method);
  if (scope === "session") return authSessionRateLimiter(c, next);
  if (scope === "identity") return apiRateLimiter(c, next);
  return authRateLimiter(c, next);
});
app.route("/api/v1/auth", authRoutes);
app.use("/api/v1/user/*", apiRateLimiter, authMiddleware);
app.route("/api/v1/user", userRoutes);
app.use("/api/v1/gallery", authMiddleware, galleryRateLimiter);
app.use("/api/v1/gallery/*", authMiddleware, galleryRateLimiter);
app.route("/api/v1/gallery", galleryRoutes);
app.onError(errorHandler);
const users = await prisma.user.count();
if (users !== 0) throw Error("ISOLATED_HTTP_TEST_DB_NOT_EMPTY");
const testMarker = randomUUID();
app.get("/__gallery_v2_test_health", c =>
  c.json({ environment: "dedicated-gallery-v2-local", ready: true,
    markerPresent: Boolean(testMarker) }));
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3601 });
console.log("GALLERY_V2_ISOLATED_REAL_HONO_READY_3601");
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    Promise.allSettled([redis.quit(), prisma.$disconnect()])
      .finally(() => process.exit(0));
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

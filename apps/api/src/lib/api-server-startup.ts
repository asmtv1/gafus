/**
 * Original API entry lifecycle. Import-safe: no app, Redis, queue, database,
 * CDN, server-listener or provider is imported or created until explicit start.
 * The real entrypoint supplies those dependencies only on direct execution.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createGracefulShutdown } from "./graceful-shutdown.js";

type Signal = "SIGTERM" | "SIGINT";
type Server = { close: (onClosed: (error?: Error) => void) => void };

export type ApiServerRuntime = {
  listen: (port: number, hostname?: string) => Server;
  startMonitor: () => () => void | Promise<void>;
  disconnectDatabase: () => Promise<void>;
  quitRedis: () => Promise<unknown>;
  logInfo: (message: string) => void;
  logError: (message: string) => void;
};

export type ApiServerProcess = {
  onSignal: (signal: Signal, listener: () => void) => void;
  exit: (code: 0 | 1) => void;
};

export function isDirectApiEntrypoint(
  moduleUrl: string,
  executableFile: string | undefined,
): boolean {
  if (!executableFile) return false;
  return fileURLToPath(moduleUrl) === resolve(executableFile);
}

/** Never loads anything on module import; the caller opts in to startup. */
export async function startApiServer(
  loadRuntime: () => Promise<ApiServerRuntime>,
  runtimeProcess: ApiServerProcess,
  port: number,
  hostname?: string,
): Promise<void> {
  // Preserve production's original ordering: serve -> log -> monitor -> signals.
  const runtime = await loadRuntime();
  let server: Server | undefined;
  try {
    server = hostname ? runtime.listen(port, hostname) : runtime.listen(port);
    runtime.logInfo(`API server running on port ${port}`);
    const stopMonitor = runtime.startMonitor();

    const shutdown = createGracefulShutdown({
      stopMonitor,
      closeHttp: (onClosed) => server!.close(onClosed),
      disconnectDatabase: runtime.disconnectDatabase,
      quitRedis: runtime.quitRedis,
      logInfo: runtime.logInfo,
      logError: runtime.logError,
      exit: runtimeProcess.exit,
    });
    runtimeProcess.onSignal("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    runtimeProcess.onSignal("SIGINT", () => {
      void shutdown("SIGINT");
    });
  } catch (startupError) {
    // A failed listen or monitor must not strand an open HTTP listener, Redis
    // or database resource. Each cleanup attempt runs even if another fails;
    // preserve the original startup error for the caller. No new providers.
    const closeHttp = () =>
      new Promise<void>((done) => {
        if (!server) return done();
        try {
          server.close(() => done());
        } catch {
          done();
        }
      });
    await Promise.allSettled([
      closeHttp(),
      Promise.resolve().then(() => runtime.disconnectDatabase()),
      Promise.resolve().then(() => runtime.quitRedis()),
    ]);
    throw startupError;
  }
}

/**
 * Explicit local API authorization still requires isolated resources, not a
 * fallback to any shared DB/Redis. Runs before importing the real app/providers.
 * Never logs environment values or credentials.
 */
export function isolatedLocalApiHostname(env: NodeJS.ProcessEnv): string | undefined {
  if (env.GAFUS_LOCAL_ISOLATED_API !== "1") return undefined;
  const fail = (): never => {
    throw new Error("LOCAL_API_ISOLATION_PREFLIGHT_DENIED");
  };
  const originalLocalPort = env.API_PORT === "3001";
  // Chat2-only local manual testing shares the exact restricted Refactor WORK
  // snapshot/JWT signer with 3001, never another DB, host or deployment.
  const chat2ManualPort = env.API_PORT === "3003" &&
    env.GAFUS_CHAT2_LOCAL_MANUAL_TEST === "1" &&
    env.CHAT2_API_ENABLED === "enabled" &&
    env.GAFUS_WEB1_ALT_HONO === undefined &&
    env.GAFUS_WEB4_ISOLATED_MEDIA === undefined &&
    env.GAFUS_GALLERY_ISOLATED_HONO === undefined;
  const web1ParityOnlyPort = env.API_PORT === "3301" &&
    env.GAFUS_WEB1_ALT_HONO === "1";
  const web4OwnPort = env.API_PORT === "3501" &&
    env.GAFUS_WEB4_ISOLATED_MEDIA === "1" &&
    env.GAFUS_WEB1_ALT_HONO !== "1";
  // Dedicated Gallery Hono on 3601, sharing only private Refactor WORK PG/MinIO.
  const galleryOnlyPort = env.API_PORT === "3601" &&
    env.GAFUS_GALLERY_ISOLATED_HONO === "1" &&
    env.GAFUS_WEB1_ALT_HONO !== "1" &&
    env.GAFUS_WEB4_ISOLATED_MEDIA === undefined &&
    env.GALLERY_ENABLED === "true" && env.FEED_ENABLED === "false";
  if (env.NODE_ENV !== "development" || env.API_HOST !== "127.0.0.1" ||
    !(originalLocalPort || chat2ManualPort || web1ParityOnlyPort ||
      web4OwnPort || galleryOnlyPort) ||
    (env.GAFUS_WEB4_ISOLATED_MEDIA !== undefined && !web4OwnPort) ||
    (env.GAFUS_GALLERY_ISOLATED_HONO !== undefined && !galleryOnlyPort))
    fail();
  // Gallery/Feed may be enabled only in the *already isolated* local MinIO
  // profile. The normal local runner still disables both. This does not admit
  // Cloud.ru, production CDN, outside-loopback S3 or arbitrary buckets.
  const profile = web4OwnPort ? "gafus-refactor-web4-" : "gafus-refactor-";
  const isolatedMedia = env.GAFUS_ISOLATED_NONPROD_S3 === "enabled" &&
    env.GAFUS_ISOLATED_S3_ENDPOINT === (web4OwnPort
      ? "http://127.0.0.1:9500" : "http://127.0.0.1:9000") &&
    env.GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET === `${profile}documents-test` &&
    (!env.GAFUS_ISOLATED_S3_QUESTIONS_BUCKET ||
      env.GAFUS_ISOLATED_S3_QUESTIONS_BUCKET === `${profile}questions-test`) &&
    env.GAFUS_ISOLATED_S3_GALLERY_BUCKET === `${profile}gallery-test` &&
    env.GAFUS_ISOLATED_S3_FEED_BUCKET === `${profile}feed-test` &&
    env.GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE === "1" &&
    env.CLOUDRU_MEDIA_JOBS_ENABLED === "false" &&
    env.GALLERY_MEDIA_FALLBACK_ENABLED === "false" &&
    env.FEED_MEDIA_FALLBACK_ENABLED === "false";
  // The dedicated local Chat2 server must never start in a state where text
  // works but every attachment fails with an opaque HTTP 503.
  if (chat2ManualPort &&
      (!isolatedMedia || env.CHAT2_PRIVATE_MEDIA_ENABLED !== "isolated-dev-only"))
    fail();
  if (env.CDN_HEALTH_MONITOR_ENABLED === "true" ||
    ((env.GALLERY_ENABLED === "true" || env.FEED_ENABLED === "true") && !isolatedMedia))
    fail();
  const forbidden = new RegExp(
    [
      "^(?:YOOKASSA_|RESEND_|SMTP_|MAIL_|SENDGRID_|APNS_|FCM_|FIREBASE_|RUSTORE_",
      "|AWS_|S3_|CLOUDRU_|CLOUD_RU_|YANDEX_|VK_|TELEGRAM_|BOT_TOKEN",
      "|PAYMENT_|WEBHOOK_|BEGET_)",
    ].join(""),
  );
  if (Object.keys(env).some((key) => {
    // Explicit test-only *disable* is not an outbound Cloud.ru credential.
    if (isolatedMedia && key === "CLOUDRU_MEDIA_JOBS_ENABLED" && env[key] === "false") return false;
    return forbidden.test(key) && Boolean(env[key]);
  })) fail();
  let database: URL, redis: URL;
  try {
    database = new URL(env.DATABASE_URL ?? "");
    redis = new URL(env.REDIS_URL ?? "");
  } catch {
    return fail();
  }
  // A real restored snapshot is writable only via its dedicated restricted
  // TCP LOGIN, never the project cluster superuser/Unix socket or reference DB.
  if (
    database.protocol !== "postgresql:" ||
    database.hostname !== "127.0.0.1" ||
    database.port !== "55921" ||
    database.pathname !== "/gafus_refactor_real_work_20261024" ||
    database.username !== "gafus_refactor_local_real" ||
    !database.password ||
    database.searchParams.get("schema") !== "public" ||
    database.searchParams.size !== 1 ||
    database.hash
  )
    fail();
  if (
    redis.protocol !== "redis:" ||
    redis.hostname !== "127.0.0.1" ||
    redis.port !== "55927" ||
    redis.pathname !== "/1" ||
    redis.username ||
    redis.password ||
    redis.search ||
    redis.hash
  )
    fail();
  return "127.0.0.1";
}

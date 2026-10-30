/**
 * Original Hono REST API entrypoint (Web + Mobile).
 * Importing this module is a safe preflight; direct execution retains the
 * original full app/Redis/monitor/server startup without a guest-only fork.
 */
import {
  isDirectApiEntrypoint,
  isolatedLocalApiHostname,
  startApiServer,
} from "./lib/api-server-startup.js";
import type { ApiServerRuntime } from "./lib/api-server-startup.js";

// This function, not module evaluation, owns all eager provider imports.
// Never call it for a source-only preflight or an unauthorized local boot.
async function loadApiRuntime(): Promise<ApiServerRuntime> {
  const [
    { app },
    { serve },
    { disconnectCoreDatabase },
    { connection: redis },
    { createWebLogger },
    { startMediaCdnMonitor },
  ] = await Promise.all([
    import("./app.js"),
    import("@hono/node-server"),
    import("@gafus/core/services/systemHealth"),
    import("@gafus/queues"),
    import("@gafus/logger"),
    import("./lib/media-cdn-monitor.js"),
  ]);

  const logger = createWebLogger("api-server");
  return {
    listen: (port, hostname) =>
      serve({ fetch: app.fetch, port, ...(hostname ? { hostname } : {}) }),
    startMonitor: () => {
      const stopMedia = startMediaCdnMonitor(redis);
      // Opt-in until an explicit release approves enabling the durable bound
      // notification reconciler. The local smoke profile has no push worker or
      // outbound provider; no global Redis queue scanning/draining is done.
      if (process.env.GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY !== "enabled") return stopMedia;
      // Never run a global recovery scan by default (especially on restored
      // historical WORK rows). Every opt-in must name one explicit learner.
      const scopeUserId = process.env.GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY_USER_ID;
      if (!scopeUserId || !/^[a-z0-9]{20,40}$/.test(scopeUserId))
        throw new Error("BOUND_NOTIFICATION_RECOVERY_OWNER_SCOPE_REQUIRED");
      if (process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
          (process.env.NODE_ENV !== "development" ||
           process.env.REDIS_URL !== "redis://127.0.0.1:55927/1" ||
           process.env.GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY_TEST_ONLY !== "1"))
        throw new Error("BOUND_NOTIFICATION_RECOVERY_LOCAL_SCOPE_DENIED");
      const recoveryAge = process.env.GAFUS_LOCAL_ISOLATED_API === "1" ? 0 : 30_000;
      let stopped = false, busy = false;
      const tick = async () => {
        if (stopped || busy) return;
        busy = true;
        try {
          const { reconcilePendingBoundNotificationIntents } = await import(
            "@gafus/core/services/notifications"
          );
          await reconcilePendingBoundNotificationIntents({ userId: scopeUserId, limit: 10, retryDelayMs: recoveryAge });
        } catch (error) {
          logger.error("Bound notification SQL outbox recovery retry", error as Error);
        } finally { busy = false; }
      };
      // Startup sweep is what closes the no-request restart window; retry
      // remains bounded. Timer has no ability to send pushes by itself.
      void tick();
      const timer = setInterval(() => { void tick(); }, 30_000);
      timer.unref();
      return () => { stopped = true; clearInterval(timer); stopMedia(); };
    },
    disconnectDatabase: disconnectCoreDatabase,
    quitRedis: () => redis.quit(),
    logInfo: (message) => logger.info(message),
    logError: (message) => logger.error(message, new Error(message)),
  };
}

// Direct `tsx watch src/index.ts` and `node dist/index.js` remain the ONLY
// automatic start paths. Other module imports cannot boot the API.
if (isDirectApiEntrypoint(import.meta.url, process.argv[1])) {
  // Reject misconfigured local targets BEFORE importing app, Redis, queues or providers.
  const hostname = isolatedLocalApiHostname(process.env);
  const port = Number(process.env.API_PORT) || 3001;
  void startApiServer(
    loadApiRuntime,
    {
      onSignal: (signal, listener) => {
        process.on(signal, listener);
      },
      exit: (code) => process.exit(code),
    },
    port,
    hostname,
  );
}

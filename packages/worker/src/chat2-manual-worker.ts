/** Refactor-only manual-testing Chat2 outbox. Does not boot legacy workers. */
import { startChat2OutboxWorker } from "./chat2-outbox-worker";
if (process.env.NODE_ENV !== "development" ||
    process.env.GAFUS_CHAT2_LOCAL_MANUAL_TEST !== "1" ||
    process.env.CHAT2_WORKER_ENABLED !== "enabled" ||
    process.env.GAFUS_LOCAL_ISOLATED_API !== "1")
  throw new Error("CHAT2_MANUAL_WORKER_ISOLATION_REQUIRED");
const stop = startChat2OutboxWorker();
// The worker tick itself is unref'd; this explicit process is kept alive only
// while a developer intentionally runs the isolated manual test harness.
const keepalive = setInterval(() => undefined, 30_000);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { stop(); clearInterval(keepalive); process.exit(0); });
}

/** ROOT031: readiness-only dependencies must not load when health router is imported. */
import type { ReadinessProbes } from "../../lib/readiness-deadline.js";

/** Only GET /ready is permitted to initialize these existing providers. */
export async function loadReadinessProbes(): Promise<ReadinessProbes> {
  // If one import rejects, still await the other before letting this probe
  // pair release ownership. /ready's existing 5s deadline stays independent.
  const [core, queues] = await Promise.allSettled([
    import("@gafus/core/services/systemHealth"),
    import("@gafus/queues"),
  ]);
  if (core.status !== "fulfilled" || queues.status !== "fulfilled") {
    // Never surface dependency error details in health JSON or logs.
    throw new Error("READINESS_PROBE_IMPORT_FAILED");
  }
  return {
    checkDatabase: core.value.checkCoreDatabaseReady,
    pingRedis: () => queues.value.connection.ping(),
  };
}

/** One lazy dependency resolution per health router; no provider work at construction. */
export function createLazyReadinessProbes(
  load: () => Promise<ReadinessProbes> = loadReadinessProbes,
): ReadinessProbes {
  let pending: Promise<ReadinessProbes> | undefined;
  const resolve = (): Promise<ReadinessProbes> => {
    if (pending) return pending;
    // Promise.resolve catches synchronous loader throws within the same /ready budget.
    const attempt = Promise.resolve().then(load);
    const observed = attempt.catch((error: unknown) => {
      if (pending === observed) pending = undefined;
      throw error;
    });
    pending = observed;
    return observed;
  };
  return {
    checkDatabase: async () => (await resolve()).checkDatabase(),
    pingRedis: async () => (await resolve()).pingRedis(),
  };
}

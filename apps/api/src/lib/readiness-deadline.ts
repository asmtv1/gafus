/** Bounded /ready probes only. Does not cancel or close shared DB/Redis handles. */
// Internal guardrail, not an external production SLA. The adjacent media
// monitor uses a 7.5s external budget; shutdown has a separate 10s budget.
export const READINESS_DEADLINE_MS = 5_000;

export interface ReadinessProbes {
  checkDatabase: () => Promise<unknown>;
  pingRedis: () => Promise<unknown>;
}

/**
 * Scope a single DB/Redis probe pair to one readiness-router instance.
 * Requests share its response deadline. Even after 503, a failed or timed-out
 * pair stays owned until BOTH underlying promises settle; only then may the
 * next request create a fresh pair. Never cancel/disconnect shared handles.
 */
export function createReadinessCheck(probes: ReadinessProbes): () => Promise<void> {
  let inFlight: { outcome: Promise<void> } | undefined;

  return () => {
    if (inFlight) return inFlight.outcome;

    // Independent microtasks ensure Redis is attempted even on a sync DB throw.
    const database = Promise.resolve().then(() => probes.checkDatabase());
    const redis = Promise.resolve().then(() => probes.pingRedis());
    const work = Promise.all([database, redis]).then(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("READINESS_DEADLINE_EXCEEDED")),
        READINESS_DEADLINE_MS,
      );
    });
    const outcome = Promise.race([work, deadline]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    const pair = { outcome };
    inFlight = pair;

    // Promise.all alone rejects before its sibling settles; this separate
    // allSettled drain avoids reopening on an early failure or late rejection.
    void Promise.allSettled([database, redis]).then(() => {
      if (inFlight === pair) inFlight = undefined;
    });
    return outcome;
  };
}

/** Existing independent one-off probe API remains a fresh isolated check. */
export function checkReadinessWithinDeadline(probes: ReadinessProbes): Promise<void> {
  return createReadinessCheck(probes)();
}

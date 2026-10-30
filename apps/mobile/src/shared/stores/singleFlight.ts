/**
 * Coalesce concurrent native sync triggers into the same in-flight operation.
 * Only a completed operation releases the guard; a later reconnect may retry.
 *
 * Does not replace server-side idempotency after process termination/restart.
 */
export function singleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;

    // Run on a microtask so sync exceptions still reject the shared Promise.
    const current = Promise.resolve().then(operation);
    inFlight = current;
    const release = () => {
      if (inFlight === current) inFlight = null;
    };
    void current.then(release, release);
    return current;
  };
}

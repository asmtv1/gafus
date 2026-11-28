export type WebFrameOutcome = { outcome: "rendered"; elapsedMs: number } | { outcome: "unsupported" | "abandoned" };
/** Observes actual compositor submission, never loadeddata/playing/readiness.
 * One terminal observation per loadstart. No timer, polling or source logging. */
export function observeFirstVideoFrame(
  video: HTMLVideoElement,
  report: (event: WebFrameOutcome) => void,
  now = () => performance.now(),
): () => void {
  let current: { started: number; callback?: number } | null = null;
  let disposed = false;
  const emit = (event: WebFrameOutcome) => {
    try { report(event); } catch { /* telemetry is best effort */ }
  };
  function finishAbandoned() {
    const sample = current;
    current = null;
    if (!sample) return;
    if (sample.callback !== undefined) {
      try { video.cancelVideoFrameCallback?.(sample.callback); }
      catch { /* stale callback is fenced below */ }
    }
    emit({ outcome: "abandoned" });
  }
  function begin() {
    if (disposed) return;
    finishAbandoned();
    if (typeof video.requestVideoFrameCallback !== "function") {
      emit({ outcome: "unsupported" });
      return;
    }
    const sample: { started: number; callback?: number } = { started: now() };
    current = sample;
    try {
      sample.callback = video.requestVideoFrameCallback((callbackTime, metadata) => {
        // A callback may already be queued when the load is replaced/unmounted.
        if (disposed || current !== sample) return;
        current = null;
        // presentationTime is the compositor submission timestamp on the
        // same monotonic clock, so a late JS callback doesn't inflate it.
        const presented = metadata?.presentationTime;
        const observed = Number.isFinite(presented)
          ? presented : (Number.isFinite(callbackTime) ? callbackTime : now());
        const elapsedMs = Math.round(observed - sample.started);
        if (Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 120_000)
          emit({ outcome: "rendered", elapsedMs });
        else emit({ outcome: "abandoned" });
      });
    } catch {
      if (current === sample) current = null;
      emit({ outcome: "unsupported" });
    }
  }
  video.addEventListener("loadstart", begin);
  video.addEventListener("emptied", finishAbandoned);
  video.addEventListener("error", finishAbandoned);
  // If mounted after loadstart, don't manufacture a duration from a late
  // observer. A later loadstart will be measured normally.
  return () => {
    disposed = true;
    video.removeEventListener("loadstart", begin);
    video.removeEventListener("emptied", finishAbandoned);
    video.removeEventListener("error", finishAbandoned);
    finishAbandoned();
  };
}

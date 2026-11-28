export type NativeFrameOutcome = { outcome: "rendered"; elapsedMs: number } | { outcome: "abandoned" };
/** A native view attachment is the measurement boundary, not readyToPlay.
 * Repeated frame notifications (including track switches) are ignored. */
export function createNativeFrameObservation(now: () => number, report: (event: NativeFrameOutcome) => void) {
  const started = now();
  let pending = true;
  const finish = (rendered: boolean) => {
    if (!pending) return;
    pending = false;
    const elapsedMs = Math.round(now() - started);
    const event: NativeFrameOutcome = rendered && Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 120_000
      ? { outcome: "rendered", elapsedMs } : { outcome: "abandoned" };
    try { report(event); } catch { /* diagnostic: expected Optional playback telemetry must never affect actual playback. */  /* telemetry cannot affect playback */ }
  };
  return { firstFrame: () => finish(true), dispose: () => finish(false) };
}

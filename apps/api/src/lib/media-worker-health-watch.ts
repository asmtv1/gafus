import { notifyStoppedMediaWorker } from "@gafus/core/services/systemHealth";
import { createWebLogger } from "@gafus/logger";

const log = createWebLogger("media-worker-watch");
const FIVE_MINUTES = 300_000;
const STARTUP_GRACE = 12 * 60_000;

/** Independent of gafus-worker. Delays first check so every newly deployed
 * worker gets a full heartbeat window before any alert is emitted.
 */
export function startMediaWorkerHealthWatch(
  enabled = process.env.CLOUDRU_MEDIA_JOBS_ENABLED === "true",
  notify = notifyStoppedMediaWorker,
): () => void {
  if (!enabled) return () => {};
  let active = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const tick = async () => {
    if (active) return;
    active = true;
    try {
      const result = await notify();
      if (result.alerted) log.warn("Media Worker availability alert queued");
    } catch (error) {
      log.error("Media Worker availability check failed", error as Error);
    } finally { active = false; }
  };
  const initial = setTimeout(() => {
    void tick();
    interval = setInterval(() => { void tick(); }, FIVE_MINUTES);
    interval.unref();
  }, STARTUP_GRACE);
  initial.unref();
  return () => {
    clearTimeout(initial);
    if (interval) clearInterval(interval);
  };
}

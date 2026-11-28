import { countDueFeedVideoRecovery } from "@gafus/feed-server/feed-video-recovery";
import { createCloudruFeedPoolDispatcher } from "./cloudru-media-dispatcher.js";

/** Feed's PostgreSQL outbox is authoritative; Cloud Jobs launch only for due work.
 * Each pool alternates its two processors; Core's attempt-token lease prevents
 * duplicate processing across concurrent workers, even for repeated wake-ups.
 */
export function createFeedMediaRecoveryTick(input: {
  countDueVideos: (now: Date) => Promise<number>;
  video: ReturnType<typeof createCloudruFeedPoolDispatcher>;
  now?: () => Date;
}) {
  let running = false;
  return async () => {
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    try {
      const now = input.now?.() ?? new Date();
      const videos = await input.countDueVideos(now);
      let dispatched = 0;
      for (let i = 0; i < Math.min(2, videos); i++) {
        const result = await input.video();
        if (result.dispatched !== 1) throw new Error("FEED_VIDEO_RECOVERY_NOT_DISPATCHED");
        dispatched++;
      }
      return { dispatched };
    } finally { running = false; }
  };
}

let recovery: ReturnType<typeof createFeedMediaRecoveryTick> | undefined;
export async function runFeedMediaRecoveryTick(): Promise<void> {
  if (process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true" ||
      process.env.FEED_PROCESSOR_READY !== "true") return;
  recovery ??= createFeedMediaRecoveryTick({
    countDueVideos: countDueFeedVideoRecovery,
    video: createCloudruFeedPoolDispatcher("video"),
  });
  await recovery();
}

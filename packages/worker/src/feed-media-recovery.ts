import { prisma } from "@gafus/prisma";
import { createCloudruFeedPoolDispatcher } from "./cloudru-media-dispatcher.js";

/** Feed's PostgreSQL outbox is authoritative; Cloud Jobs launch only for due work.
 * Each pool alternates its two processors; Core's attempt-token lease prevents
 * duplicate processing across concurrent workers, even for repeated wake-ups.
 */
export function createFeedMediaRecoveryTick(input: {
  database: Pick<typeof prisma, "feedStorageJob">;
  photo: ReturnType<typeof createCloudruFeedPoolDispatcher>;
  video: ReturnType<typeof createCloudruFeedPoolDispatcher>;
  now?: () => Date;
}) {
  let running = false;
  return async () => {
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    try {
      const now = input.now?.() ?? new Date();
      const due = await input.database.feedStorageJob.groupBy({
        by: ["kind"],
        where: { OR: [
          { status: "pending", availableAt: { lte: now } },
          { status: "processing", leaseUntil: { lt: now } },
        ] },
        _count: { _all: true },
      });
      let photos = 0, videos = 0;
      for (const row of due) {
        if (row.kind === "publish_video") videos += row._count._all;
        else if (["publish_photo", "copy_album", "delete_keys", "cleanup_source"].includes(row.kind))
          photos += row._count._all;
      }
      let dispatched = 0;
      for (let i = 0; i < Math.min(2, photos); i++) {
        const result = await input.photo();
        if (result.dispatched !== 1) throw new Error("FEED_PHOTO_RECOVERY_NOT_DISPATCHED");
        dispatched++;
      }
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
    database: prisma,
    photo: createCloudruFeedPoolDispatcher("photo"),
    video: createCloudruFeedPoolDispatcher("video"),
  });
  await recovery();
}

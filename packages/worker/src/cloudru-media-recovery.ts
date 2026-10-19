/**
 * Five-minute, demand-driven safety net for missed BullMQ wake-ups and expired
 * leases. Never call a billable Cloud.ru Job unless its durable source of truth
 * says runnable work exists. The immediate, per-upload queues remain primary.
 */
import { prisma } from "@gafus/prisma";
import { hasPendingQuestionCloudWork } from "@gafus/cdn-upload";
import { createCloudruFeedPoolDispatcher, createCloudruMediaDispatcher } from "./cloudru-media-dispatcher";

export type RecoveryKind = "gallery" | "feed-photo" | "feed-video" | "questions";
const KINDS: readonly RecoveryKind[] = ["gallery", "feed-photo", "feed-video", "questions"];
type Recover = () => Promise<{ dispatched?: number; disabled?: boolean; skipped?: boolean }>;
type Check = (kind: RecoveryKind) => Promise<boolean>;
const PHOTO_KINDS = ["copy_album", "publish_photo", "delete_keys", "cleanup_source"] as const;

export function enabledRecoveryKind(kind: RecoveryKind, env: NodeJS.ProcessEnv): boolean {
  if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true") return false;
  switch (kind) {
    case "gallery": return env.GALLERY_PROCESSOR_READY === "true";
    case "feed-photo":
    case "feed-video": return env.FEED_PROCESSOR_READY === "true";
    case "questions":
      return env.QUESTIONS_PROCESSOR_READY === "true" &&
        env.QUESTIONS_CLOUD_JOB_ENABLED === "true" &&
        env.QUESTIONS_PUBLIC_S3_ENABLED === "true";
  }
}

/** DB read only: use the same due/lease predicates as Core's claim methods.
 * Gallery reservation expiry and stalled uploads also require maintenance.
 * A RUNNING lease is not due, avoiding duplicate Cloud.ru launches.
 */
export async function hasDueCloudruWork(kind: RecoveryKind, at = new Date()): Promise<boolean> {
  const dueJob = {
    OR: [
      { status: "pending" as const, availableAt: { lte: at } },
      { status: "processing" as const, leaseUntil: { lt: at } },
    ],
  };
  if (kind === "gallery") {
    const [storageJob, upload] = await Promise.all([
      prisma.galleryStorageJob.findFirst({
        where: dueJob, select: { id: true },
      }),
      prisma.galleryUpload.findFirst({
        where: { OR: [
          { status: "uploaded", nextAttemptAt: { lte: at } },
          { status: "processing", leaseUntil: { lte: at } },
          { status: { in: ["reserved", "uploaded", "processing"] }, reservationExpiresAt: { lte: at } },
        ] }, select: { id: true },
      }),
    ]);
    return Boolean(storageJob || upload);
  }
  if (kind === "questions") return hasPendingQuestionCloudWork();
  const due = await prisma.feedStorageJob.findFirst({
    where: {
      ...dueJob,
      kind: kind === "feed-video" ? "publish_video" : { in: [...PHOTO_KINDS] },
    },
    select: { id: true },
  });
  return Boolean(due);
}

/** Provider failures are isolated per kind and retried on future 5-minute
 * ticks with exponential cooldown. New uploads bypass this cooldown by using
 * their own immediate BullMQ queue and exponential backoff.
 */
export function createCloudruMediaRecovery({
  env = process.env,
  check = hasDueCloudruWork,
  now = () => Date.now(),
  dispatch,
  report = (_kind: RecoveryKind, _reason: "check" | "execute") => {},
}: {
  env?: NodeJS.ProcessEnv;
  check?: Check;
  now?: () => number;
  dispatch?: (kind: RecoveryKind) => Promise<{ dispatched?: number; disabled?: boolean; skipped?: boolean }>;
  report?: (kind: RecoveryKind, reason: "check" | "execute") => void;
} = {}) {
  const attempts = new Map<RecoveryKind, number>();
  const nextAt = new Map<RecoveryKind, number>();
  const lazy = new Map<RecoveryKind, Recover>();
  let running = false;
  const runKind = async (kind: RecoveryKind) => {
    if (!enabledRecoveryKind(kind, env) || now() < (nextAt.get(kind) ?? 0)) return false;
    let stage: "check" | "execute" = "check";
    try {
      if (!(await check(kind))) {
        attempts.delete(kind);
        nextAt.delete(kind);
        return false;
      }
      stage = "execute";
      let execute = lazy.get(kind);
      if (!execute) {
        execute = kind === "feed-photo" || kind === "feed-video"
          ? createCloudruFeedPoolDispatcher(kind === "feed-video" ? "video" : "photo", env)
          : createCloudruMediaDispatcher(env, fetch,
            [kind === "gallery" ? "gafus-gallery-process" : "gafus-questions-photo"]);
        lazy.set(kind, execute);
      }
      const result = await (dispatch ? dispatch(kind) : execute());
      if (result.dispatched !== 1) throw new Error("CLOUDRU_RECOVERY_UNCONFIRMED");
      attempts.delete(kind);
      nextAt.delete(kind);
      return true;
    } catch {
      const failures = Math.min(5, (attempts.get(kind) ?? 0) + 1);
      attempts.set(kind, failures);
      nextAt.set(kind, now() + Math.min(3_600_000, 300_000 * 2 ** (failures - 1)));
      // Never include provider error text, request details, object keys or credentials.
      report(kind, stage);
      return false;
    }
  };
  return async () => {
    if (env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true") return { disabled: true, dispatched: 0 };
    if (running) return { skipped: true, dispatched: 0 };
    running = true;
    try {
      // All four queues are independent: a Gallery 499 cannot block Feed.
      const results = await Promise.all(KINDS.map(runKind));
      return { dispatched: results.filter(Boolean).length };
    } finally {
      running = false;
    }
  };
}

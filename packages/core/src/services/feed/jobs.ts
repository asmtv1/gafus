import type { FeedStoragePort } from "./ports";
import { FeedError } from "./errors";

export const FEED_JOB_MAX_ATTEMPTS = 5;
export const FEED_JOB_LEASE_MS = 120_000;
export const validateFeedJobBatch = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1 || n > 20)
    throw new FeedError("VALIDATION_ERROR", "Некорректное количество заданий", 400);
};
const validKey = (key: string) =>
  /^media\/v2\/[A-Za-z0-9_-]{1,128}\/v1\/(?:image\/[sml]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/.test(
    key,
  );
export interface FeedAssetOutput {
  width: number;
  height: number;
  durationSeconds?: number;
  smallKey?: string;
  thumbKey?: string;
  fullKey?: string;
  posterKey?: string;
  mp4Keys?: string[];
}
export interface FeedStorageJobClaim {
  id: string;
  attemptToken: string;
  kind: "copy_album" | "publish_photo" | "publish_video" | "delete_keys" | "cleanup_source";
  ownerId: string;
  postId: string | null;
  uploadId: string | null;
  mediaId: string | null;
  sourceKeys: string[];
  targetKeys: string[];
  attempts: number;
  leaseUntil?: string;
  sourceETag?: string;
  sourceBytes?: number;
}
export function assertFeedAssetOutput(job: FeedStorageJobClaim, output: FeedAssetOutput) {
  if (
    !job.postId ||
    !job.mediaId ||
    !Number.isSafeInteger(output.width) ||
    output.width <= 0 ||
    !Number.isSafeInteger(output.height) ||
    output.height <= 0 ||
    output.width * output.height > 50_000_000
  )
    throw new FeedError("VALIDATION_ERROR", undefined, 422);
  const prefix = `media/v2/${job.mediaId}/v1/`;
  const keys = [
    output.smallKey,
    output.thumbKey,
    output.fullKey,
    output.posterKey,
    ...(output.mp4Keys ?? []),
  ].filter((key): key is string => Boolean(key));
  if (
    keys.some((key) => !validKey(key) || !key.startsWith(prefix)) ||
    keys.length !== new Set(keys).size
  ) {
    throw new FeedError("VALIDATION_ERROR", "Некорректные ключи результата", 422);
  }
  if (job.kind === "publish_video" && job.targetKeys.length === 1) {
    // Separate non-blocking enhancement: 360p may only supplement a READY 720p.
    if (
      job.uploadId ||
      job.sourceKeys.length !== 1 ||
      job.sourceKeys[0] !== prefix + "video/720.mp4" ||
      job.targetKeys[0] !== prefix + "video/360.mp4" ||
      output.posterKey ||
      output.smallKey ||
      output.thumbKey ||
      output.fullKey ||
      output.mp4Keys?.length !== 1 ||
      output.mp4Keys[0] !== job.targetKeys[0] ||
      !Number.isFinite(output.durationSeconds) ||
      !output.durationSeconds ||
      output.durationSeconds > 120
    ) {
      throw new FeedError("VALIDATION_ERROR", "Недопустимый результат фоновой 360p", 422);
    }
  } else if (job.kind === "publish_video") {
    const quality = (output.mp4Keys ?? []).map((key) => key.slice(prefix.length));
    if (
      !output.posterKey ||
      output.posterKey !== prefix + "poster.webp" ||
      !quality.some((q) => q === "video/720.mp4" || q === "video/360.mp4") ||
      quality.length > 2 ||
      quality.some((name) => !/^video\/(360|720)\.mp4$/.test(name)) ||
      !Number.isFinite(output.durationSeconds) ||
      !output.durationSeconds ||
      output.durationSeconds > 120 ||
      output.smallKey ||
      output.thumbKey ||
      output.fullKey
    ) {
      throw new FeedError("VALIDATION_ERROR", "Неполная обработка MP4", 422);
    }
  } else if (
    output.smallKey !== prefix + "image/s.webp" ||
    output.thumbKey !== prefix + "image/m.webp" ||
    output.fullKey !== prefix + "image/l.webp" ||
    output.posterKey ||
    output.mp4Keys?.length ||
    output.durationSeconds !== undefined
  ) {
    throw new FeedError("VALIDATION_ERROR", "Неполная обработка WebP", 422);
  }
  if (
    job.kind === "copy_album" &&
    (job.targetKeys.length !== 3 ||
      !job.targetKeys.includes(output.smallKey!) ||
      !job.targetKeys.includes(output.thumbKey!) ||
      !job.targetKeys.includes(output.fullKey!))
  ) {
    throw new FeedError("VALIDATION_ERROR", "Несовпадение адресов копии альбома", 422);
  }
}
export async function verifyFeedFinalObjects(
  storage: Pick<FeedStoragePort, "head"> | undefined,
  output: FeedAssetOutput,
): Promise<void> {
  if (!storage) return; // Injected for the live Core runtime; pure DB fixtures have no S3.
  const keys = [
    output.smallKey,
    output.thumbKey,
    output.fullKey,
    output.posterKey,
    ...(output.mp4Keys ?? []),
  ].filter((key): key is string => Boolean(key));
  // Fail closed on missing, zero-length or mislabelled S3 objects; do not trust callback JSON.
  await Promise.all(
    keys.map(async (key) => {
      const metadata = await storage.head(key);
      if (
        !metadata ||
        metadata.bytes <= 0 ||
        !metadata.etag ||
        metadata.contentType !== (key.endsWith(".mp4") ? "video/mp4" : "image/webp")
      )
        throw new FeedError("VALIDATION_ERROR", "Вариант медиа не подтверждён в S3", 422);
    }),
  );
}
export interface FeedStorageJobOperations {
  claim(
    batchSize?: number,
    workerType?: "photo" | "video",
    exactCleanup?: { jobId: string; ownerId: string; kind: "delete_keys" | "cleanup_source" },
    exactMedia?: { jobId: string; ownerId: string; kind: "publish_photo" | "publish_video" },
  ): Promise<FeedStorageJobClaim[]>;
  complete(
    id: string,
    attemptToken: string,
    output?: FeedAssetOutput,
  ): Promise<{ accepted: boolean }>;
  fail(id: string, attemptToken: string, code?: string): Promise<{ accepted: boolean }>;
  renew(id: string, attemptToken: string): Promise<{ accepted: boolean }>;
}

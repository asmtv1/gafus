/**
 * Chat2 / Questions V2 durable media state machine, independent of storage.
 * Callers still own Prisma transactions, actor ACL, signed S3 operations,
 * leases and compare-and-swap predicates. No remote I/O or process globals.
 */
export function mediaTaskFailurePolicy(attempts: number, maximumAttempts: number,
  at: Date): { terminal: boolean; status: "FAILED" | "QUEUED"; nextAttemptAt: Date } {
  if (!Number.isSafeInteger(attempts) || attempts < 1 ||
      !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 ||
      !Number.isFinite(at.getTime())) throw Error("INVALID_MEDIA_FAILURE_POLICY_INPUT");
  const terminal = attempts >= maximumAttempts;
  const delayMs = Math.min(10 * 60_000, 15_000 * (2 ** Math.max(0, attempts - 1)));
  return { terminal, status: terminal ? "FAILED" : "QUEUED",
    nextAttemptAt: new Date(at.getTime() + delayMs) };
}

/** Both queue janitors use the same capped transient S3-delete retry policy. */
export function mediaCleanupRetryDelayMs(cleanupAttempts: number): number {
  if (!Number.isSafeInteger(cleanupAttempts) || cleanupAttempts < 0)
    throw Error("INVALID_MEDIA_CLEANUP_ATTEMPTS");
  return Math.min(60 * 60_000, 15_000 * (2 ** Math.min(cleanupAttempts, 8)));
}

/** No real storage grants before a processed, schema-validated rendition. */
export const chat2CanRetryConfirmedUpload = (status: string): boolean =>
  ["UPLOADED", "QUEUED", "PROCESSING", "READY"].includes(status);

export const chat2CanAttachVerifiedOriginal = (status: string): boolean =>
  ["UPLOADED", "QUEUED", "PROCESSING", "READY"].includes(status);

export const chat2MediaWithoutRendition = (status: string): boolean =>
  ["UPLOADED", "QUEUED", "PROCESSING", "FAILED", "EXPIRED"].includes(status);

/** A repeated confirmation is only idempotent after the durable QUEUED write. */
export const questionsCanRetryConfirmedPhoto = (status: string): boolean =>
  ["QUEUED", "PROCESSING", "READY"].includes(status);

/** POST signed for 10 min; cleanup never races with a valid upload/lease. */
export function questionsSafeCleanupAt(at: Date, createdAt: Date,
  leaseUntil?: Date | null): Date {
  if (![at, createdAt, ...(leaseUntil ? [leaseUntil] : [])].every(x => Number.isFinite(x.getTime())))
    throw Error("INVALID_QUESTIONS_CLEANUP_DEADLINE");
  return new Date(Math.max(at.getTime(), createdAt.getTime() + 11 * 60_000,
    leaseUntil ? leaseUntil.getTime() + 60_000 : 0));
}

/** Applies only after actor-scoped count inside the same database transaction. */
export function questionsPhotoDailyLimitReached(count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0) throw Error("INVALID_QUESTIONS_PHOTO_COUNT");
  return count >= 100;
}

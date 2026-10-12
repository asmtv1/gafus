import { createHash } from "node:crypto";

const RETRY_BACKOFF_MINUTES = [10, 30, 120, 360, 1440] as const;
export const MAX_RENEWAL_ATTEMPTS = 5;

/** Stable key for a single charge attempt: prevents duplicate provider charges. */
export function buildRenewalIdempotenceKey(
  userId: string, subscriptionId: string, periodEnd: Date, attemptCount: number,
): string {
  return createHash("sha256").update([
    "appsub-renewal", userId, subscriptionId, periodEnd.toISOString(),
    `attempt:${attemptCount}`,
  ].join(":")).digest("hex");
}

/** Refunds/canceled attempts do not change historic billing agreement. */
export function getNextRenewalAttemptAt(now: Date, attemptCount: number): Date {
  const minutes = RETRY_BACKOFF_MINUTES[
    Math.min(Math.max(attemptCount - 1, 0), RETRY_BACKOFF_MINUTES.length - 1)
  ];
  return new Date(now.getTime() + minutes * 60_000);
}

export function renewalAmountsEqualToKopecks(left: unknown, right: unknown): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) &&
    Math.round(a * 100) === Math.round(b * 100);
}

export function isRenewalUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: string }).code === "P2002";
}

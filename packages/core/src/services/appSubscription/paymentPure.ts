/** Deterministic, side-effect-free YooKassa billing normalization/locking helpers.
 * Extracted from paymentService without touching provider IO, SQL, retries,
 * idempotency or webhook state transitions.
 */
import { createHash } from "node:crypto";
import { Status as AppleSubscriptionStatus } from "@apple/app-store-server-library";

export function hashAdvisoryLockKey(value: string): number {
  return createHash("sha256").update(value).digest().readInt32BE(0);
}


export function getYookassaPaymentMethodDisplayTitle(params: {
  type?: string | null;
  title?: string | null;
  last4?: string | null;
}): string | null {
  if (params.type?.trim().toLowerCase() === "sbp") {
    return "СБП";
  }
  const title = params.title?.trim();
  if (title) return title;
  const last4 = params.last4?.trim();
  return last4 ? `Карта *${last4}` : null;
}


export function normalizeFingerprintPart(
  value: string | undefined,
  casing: "lower" | "upper" | "keep" = "keep",
): string {
  const normalized = (value ?? "").trim();
  if (casing === "lower") return normalized.toLowerCase();
  if (casing === "upper") return normalized.toUpperCase();
  return normalized;
}


export function amountsEqual(a: unknown, b: unknown): boolean {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.001;
}


/** Pure Apple status normalization (the verified transaction stays in the caller). */
export type AppleServerSyncStatus = "ACTIVE" | "PAST_DUE" | "EXPIRED" | "REVOKED";

export function msToDate(value: unknown): Date | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}

export function mapAppleServerStatus(params: {
  appleStatus: number | undefined;
  transaction: { revocationDate?: number; expiresDate?: number };
  now: Date;
}): AppleServerSyncStatus {
  const revokedAt = msToDate(params.transaction.revocationDate);
  if (revokedAt || params.appleStatus === AppleSubscriptionStatus.REVOKED) return "REVOKED";
  if (params.appleStatus === AppleSubscriptionStatus.BILLING_RETRY) return "PAST_DUE";
  if (params.appleStatus === AppleSubscriptionStatus.EXPIRED) return "EXPIRED";
  if (
    params.appleStatus === AppleSubscriptionStatus.ACTIVE ||
    params.appleStatus === AppleSubscriptionStatus.BILLING_GRACE_PERIOD
  ) {
    return "ACTIVE";
  }

  const periodEnd = msToDate(params.transaction.expiresDate);
  return periodEnd && periodEnd > params.now ? "ACTIVE" : "EXPIRED";
}

export function applePaymentStatus(
  status: AppleServerSyncStatus,
): "SUCCEEDED" | "CANCELED" | "FAILED" | "REFUNDED" {
  if (status === "ACTIVE") return "SUCCEEDED";
  if (status === "PAST_DUE") return "FAILED";
  if (status === "REVOKED") return "REFUNDED";
  return "CANCELED";
}

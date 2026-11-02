/** Deterministic, side-effect-free YooKassa billing normalization/locking helpers.
 * Extracted from paymentService without touching provider IO, SQL, retries,
 * idempotency or webhook state transitions.
 */
import { createHash } from "node:crypto";

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

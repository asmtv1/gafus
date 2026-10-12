/** Pure NPD receipt operation retry policy; provider I/O remains an adapter. */
export const NPD_RECEIPT_RETRY_DELAYS_MS = [
  60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000,
] as const;

export function isNpdReceiptErrorRetryable(code: string): boolean {
  return code === "RATE_LIMITED" || code === "TIMEOUT" || code === "NETWORK";
}

export function getNextNpdReceiptRetryAt(attemptCount: number, now: Date): Date {
  const base = NPD_RECEIPT_RETRY_DELAYS_MS[
    Math.min(Math.max(Math.trunc(attemptCount) - 1, 0), NPD_RECEIPT_RETRY_DELAYS_MS.length - 1)
  ];
  const jitter = Math.floor(base * ((Math.trunc(attemptCount) * 37) % 11) / 100);
  return new Date(now.getTime() + base + jitter);
}

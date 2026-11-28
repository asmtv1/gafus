export const INITIAL_CHECKOUT_REPLAY_WINDOW_MS = 10 * 60_000;
export const INITIAL_CHECKOUT_REPLAY_COOLDOWN_MS = 30_000;
export const INITIAL_CHECKOUT_MAX_ATTEMPTS = 3;

/** A new key after an uncertain provider ACK could charge twice. Only the
 * exact frozen POST may be retried, well within provider idempotency retention. */
export function canReplayInitialCheckout(input: {
  idempotenceKey: string; returnUrl: string | null; createdAt: Date;
  lastAttemptAt: Date | null; attemptCount: number; now: Date;
}): boolean {
  const age = input.now.getTime() - input.createdAt.getTime();
  const sinceAttempt = input.lastAttemptAt
    ? input.now.getTime() - input.lastAttemptAt.getTime() : age;
  return input.idempotenceKey.startsWith("appsub-init:") &&
    typeof input.returnUrl === "string" && input.returnUrl.length > 0 &&
    Number.isFinite(age) && age >= 0 && age < INITIAL_CHECKOUT_REPLAY_WINDOW_MS &&
    Number.isFinite(sinceAttempt) && sinceAttempt >= INITIAL_CHECKOUT_REPLAY_COOLDOWN_MS &&
    Number.isSafeInteger(input.attemptCount) && input.attemptCount >= 1 &&
    input.attemptCount < INITIAL_CHECKOUT_MAX_ATTEMPTS;
}

export function frozenCheckoutIntervalDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  return Number.isSafeInteger(days) && days > 0 ? days : null;
}

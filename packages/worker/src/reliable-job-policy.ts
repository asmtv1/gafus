/** Pure retry semantics shared by durable jobs. No raw provider response is persisted. */
export type JobFailure = { code: string; retryable: boolean; retryAfterMs?: number };
const terminalCodes = new Set([
  "CHAT2_CENTRIFUGO_NOT_CONFIGURED", "CHAT2_UNSAFE_REALTIME_ENDPOINT",
  "CHAT2_TRAINER_ASSIGNMENT_MISMATCH", "CHAT2_V2_DELETE_INVALID_MARKER",
  "CHAT2_V2_DELETE_INVALID_SOURCE", "CHAT2_RETIRED_PHOTO_WAKE",
  "CHAT2_INVALID_WAKE_ID", "CHAT2_BROKER_AUTH_DENIED", "CHAT2_BROKER_BAD_REQUEST",
]);
const knownCodes = new Set([...terminalCodes,
  "CHAT2_CENTRIFUGO_PUBLISH_FAILED", "CHAT2_CENTRIFUGO_PUBLISH_REJECTED",
  "CHAT2_V2_DELETE_TASK_MISSING", "CHAT2_V2_DELETE_ACTIVE_PROCESSING",
  "CHAT2_OUTBOX_DISPATCH_FAILED", "CHAT2_CENTRIFUGO_RATE_LIMITED",
]);
export function classifyJobError(err: unknown): JobFailure {
  const message = err instanceof Error ? err.message : "";
  const code = knownCodes.has(message) ? message : "CHAT2_OUTBOX_DISPATCH_FAILED";
  const rawRetryAfter = (err as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  const retryAfterMs = typeof rawRetryAfter === "number" && Number.isFinite(rawRetryAfter)
    ? Math.min(3_600_000, Math.max(0, rawRetryAfter)) : undefined;
  return { code, retryable: !terminalCodes.has(code), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
}
export function nextJobAttemptDelay(attempt: number, random: () => number = Math.random): number {
  // Full jitter, bounded to one minute; at-least-once delivery tolerates retries.
  const cap = Math.min(60_000, 1000 * 2 ** Math.min(6, Math.max(0, attempt - 1)));
  return Math.floor(cap / 2 + Math.min(1, Math.max(0, random())) * cap / 2);
}
export const MAX_CHAT2_OUTBOX_ATTEMPTS = 8;

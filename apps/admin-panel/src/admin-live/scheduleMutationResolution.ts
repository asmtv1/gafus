import { AdminHttpError } from "./api";

/** Staff schedule mutations have no idempotency key. A lost ACK must not invite a blind retry. */
export function scheduleMutationNeedsReadback(cause: unknown): boolean {
  return !(
    cause instanceof AdminHttpError &&
    [400, 401, 403, 404, 422].includes(cause.status) &&
    cause.code !== "INVALID_RESPONSE" &&
    cause.code !== "STATUS_MISMATCH"
  );
}

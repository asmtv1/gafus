import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const INTERNAL_FEED_PATHS = [
  "/internal/feed/uploads/claim",
  "/internal/feed/uploads/complete",
  "/internal/feed/uploads/fail",
  "/internal/feed/jobs/claim",
  "/internal/feed/jobs/complete",
  "/internal/feed/jobs/fail",
  "/internal/feed/jobs/renew",
  "/internal/feed/maintenance",
] as const;
export type FeedInternalPath = typeof INTERNAL_FEED_PATHS[number];
export interface FeedNonceStore {
  /** Atomic, shared, create-if-absent store expiring at epoch milliseconds. */
  consume(id: string, expiresAt: number): Promise<boolean>;
}
export function canonicalFeedRequest(
  method: string, path: string, rawBody: string | Uint8Array, seconds: string, nonce: string,
): string {
  if (method !== "POST" || !INTERNAL_FEED_PATHS.some(allowed => allowed === path) ||
    !/^\d{10}$/.test(seconds) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    throw new Error("INVALID_FEED_SIGNING_INPUT");
  }
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return `feed-v1\n${seconds}\n${nonce}\n${method}\n${path}\n${bodyHash}`;
}
export function signFeedRequest(input: {
  path: FeedInternalPath; body: string | Uint8Array; key: Uint8Array;
  timestamp?: number; nonce?: string;
}) {
  if (input.key.byteLength < 32) throw new Error("INVALID_SIGNING_KEY");
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomUUID();
  const signature = createHmac("sha256", input.key)
    .update(canonicalFeedRequest("POST", input.path, input.body, timestamp, nonce)).digest("hex");
  return {
    "x-feed-timestamp": timestamp, "x-feed-nonce": nonce, "x-feed-signature": signature,
  };
}
export function createFeedRequestVerifier(
  input: { key: Uint8Array; nonces: FeedNonceStore; now?: () => number },
) {
  if (input.key.byteLength < 32) throw new Error("INVALID_SIGNING_KEY");
  return async (request: {
    method: string; path: string; body: string | Uint8Array;
    headers: Record<string, string | undefined>;
  }): Promise<boolean> => {
    const t = request.headers["x-feed-timestamp"] ?? "";
    const nonce = request.headers["x-feed-nonce"] ?? "";
    const signed = request.headers["x-feed-signature"] ?? "";
    const now = (input.now ?? Date.now)();
    if (Buffer.byteLength(request.body) > 16384 || !/^[a-f0-9]{64}$/.test(signed) ||
      !/^\d{10}$/.test(t) || Math.abs(now / 1000 - Number(t)) > 60) return false;
    let expected: string;
    try {
      expected = createHmac("sha256", input.key)
        .update(canonicalFeedRequest(request.method, request.path, request.body, t, nonce)).digest("hex");
    } catch { return false; }
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signed, "hex"))) return false;
    // A valid future timestamp cannot reduce nonce lifetime.
    return input.nonces.consume(`feed-v1:${nonce}`, (Number(t) + 61) * 1000);
  };
}

/** Chat2-only in-process readiness. Does not touch user records or publish events.
 * A healthy generic Worker /health is NOT evidence that Chat2 outbox is alive.
 */
import { timingSafeEqual } from "node:crypto";

const FRESH_MS = 10_000;
let lastSuccessfulPoll = 0;

export function resetChat2PollReadiness(): void { lastSuccessfulPoll = 0; }
export function recordChat2PollSuccess(now = Date.now()): void { lastSuccessfulPoll = now; }
export function chat2PollIsFresh(now = Date.now()): boolean {
  return process.env.CHAT2_WORKER_ENABLED === "enabled" &&
    lastSuccessfulPoll > 0 && now >= lastSuccessfulPoll && now - lastSuccessfulPoll <= FRESH_MS;
}

export function hasChat2ReadinessKey(input: string | readonly string[] | undefined): boolean {
  const key = process.env.CHAT2_CENTRIFUGO_API_KEY;
  if (typeof input !== "string" || !key || key.length < 16) return false;
  // Node compares Buffer byte lengths, not JavaScript Unicode code-unit lengths.
  // A malformed Unicode header must fail closed without throwing RangeError.
  const provided = Buffer.from(input, "utf8");
  const expected = Buffer.from(key, "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** One private Docker service URL is allowed in production. The entire
 * worker-publish and worker-readiness path must use the same allowlist.
 */
export function chat2BrokerPublishUrl(raw: string | undefined,
  production = process.env.NODE_ENV === "production"): URL | null {
  if (!raw) return null;
  try {
    const target = new URL(raw);
    if (target.href === "http://chat2-centrifugo:8000/api/publish") return target;
    if (!production && target.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(target.hostname) &&
        target.pathname === "/api/publish" && !target.search && !target.hash &&
        !target.username && !target.password) return target;
  } catch { /* refuse invalid URLs */ }
  return null;
}

/** Read-only authenticated Centrifugo API info; /health alone ignores API auth. */
export async function probeChat2BrokerAuth(fetcher: typeof fetch = fetch): Promise<boolean> {
  const raw = process.env.CHAT2_CENTRIFUGO_HTTP_API;
  const key = process.env.CHAT2_CENTRIFUGO_API_KEY;
  if (!key || key.length < 16) return false;
  try {
    const target = chat2BrokerPublishUrl(raw);
    if (!target) return false;
    target.pathname = "/api/info";
    const reply = await fetcher(target, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(1500),
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: "{}",
    });
    if (reply.status !== 200) return false;
    const body: unknown = await reply.json();
    return !!body && typeof body === "object" && !Array.isArray(body) &&
      !((body as { error?: unknown }).error) &&
      !!(body as { result?: unknown }).result &&
      typeof (body as { result?: unknown }).result === "object";
  } catch { return false; }
}

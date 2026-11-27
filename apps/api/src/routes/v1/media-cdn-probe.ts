import { Hono } from "hono";
import { isTrustedCdnProbeUrl } from "@gafus/core/services/mediaDelivery";

/** Hono counterpart of the previous authenticated Next CDN status proxy.
 * Browsers cannot distinguish cross-origin CDN 504 from CORS failures.
 * Only validated signed Gallery/Feed and immutable public Chat2/Questions
 * final URLs are HEADed; never proxy bodies or issue S3 storage grants.
 */
export const mediaCdnProbeRoutes = new Hono();
const hosts = ["fupiquafifeswu.begetcdn.cloud", "quepraquiecebquomiel.begetcdn.cloud",
  "ebiteskukingusk.begetcdn.cloud", "gonomudedoje.begetcdn.cloud", "cdn.gafus.ru"] as const;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
/** Synthetic loopback CDN status socket, available ONLY during Agent2 disposable QA.
 * It cannot be used with a shared/work DB, a production runtime or any other host.
 */
function exactIsolatedCdnStatusUrl(raw: string): boolean {
  if (process.env.NODE_ENV !== "test" ||
      process.env.GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE !== "1" ||
      process.env.DATABASE_URL !== "postgresql://asmtv1@127.0.0.1:55446/cdn_agent2_qa" ||
      process.env.REDIS_URL !== "redis://127.0.0.1:56340") return false;
  return /^http:\/\/127\.0\.0\.1:58344\/(?:gallery|feed)\/(?:403|404|410|503|504)$/.test(raw);
}
// Only join simultaneous HEAD requests for the exact validated URL. Never
// cache results after completion: an object can be revoked at any time.
// Authentication and URL validation still run separately for every caller.
const MAX_PENDING_PROBES = 256;
const pendingProbes = new Map<string, Promise<number>>();

async function readCdnStatus(url: string): Promise<number> {
  try {
    const upstream = await fetch(url, {
      method: "HEAD", cache: "no-store", credentials: "omit",
      redirect: "manual", signal: AbortSignal.timeout(6500),
    });
    return upstream.status;
  } catch {
    return 503;
  }
}

function probeStatus(url: string): Promise<number> {
  const pending = pendingProbes.get(url);
  if (pending) return pending;
  // Saturation must not manufacture an outage or retain unbounded signed URLs.
  if (pendingProbes.size >= MAX_PENDING_PROBES) return Promise.resolve(429);
  const result = readCdnStatus(url).finally(() => pendingProbes.delete(url));
  pendingProbes.set(url, result);
  return result;
}

mediaCdnProbeRoutes.get("/", async c => {
  if (!c.get("user")?.id) return new Response(null, { status: 401, headers });
  const params = [...new URL(c.req.url).searchParams];
  if (params.length !== 1 || params[0]?.[0] !== "url" ||
      !(isTrustedCdnProbeUrl(params[0][1], hosts) || exactIsolatedCdnStatusUrl(params[0][1])))
    return new Response(null, { status: 400, headers });
  // Do not turn private/missing CDN objects (403/404) into S3 fallback.
  return new Response(null, { status: await probeStatus(params[0][1]), headers });
});

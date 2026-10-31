import { Hono } from "hono";
import { isTrustedCdnProbeUrl } from "@gafus/core/services/mediaDelivery";

/** Hono counterpart of the previous authenticated Next CDN status proxy.
 * Browsers cannot distinguish cross-origin CDN 504 from CORS failures.
 * Only validated short-lived CDN URLs are HEADed; never proxy bodies or S3 keys.
 */
export const mediaCdnProbeRoutes = new Hono();
const hosts = ["mepsuduyokabib.begetcdn.cloud", "dikinuneceswe.begetcdn.cloud", "garaquachegasourn.begetcdn.cloud"] as const;
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
mediaCdnProbeRoutes.get("/", async c => {
  if (!c.get("user")?.id) return new Response(null, { status: 401, headers });
  const params = [...new URL(c.req.url).searchParams];
  if (params.length !== 1 || params[0]?.[0] !== "url" ||
      !(isTrustedCdnProbeUrl(params[0][1], hosts) || exactIsolatedCdnStatusUrl(params[0][1])))
    return new Response(null, { status: 400, headers });
  try {
    const upstream = await fetch(params[0][1], {
      method: "HEAD", cache: "no-store", credentials: "omit",
      redirect: "manual", signal: AbortSignal.timeout(6500),
    });
    // Do not turn private/missing CDN objects (403/404) into S3 fallback.
    return new Response(null, { status: upstream.status, headers });
  } catch {
    // Network failures/timeouts have the same recovery semantics as old Next.
    return new Response(null, { status: 503, headers });
  }
});

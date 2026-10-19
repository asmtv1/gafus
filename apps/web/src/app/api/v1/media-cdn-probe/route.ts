import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { isTrustedCdnProbeUrl } from "@gafus/core/services/mediaDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
const legacyHosts = ["mepsuduyokabib.begetcdn.cloud", "garaquachegasourn.begetcdn.cloud"] as const;
const newGalleryHost = "dikinuneceswe.begetcdn.cloud" as const;

/** Same-origin status proxy: browser cannot read CORS-blocked CDN 504 via HEAD.
 * Strict URL allowlist + authentication avoids SSRF; no response body is
 * forwarded and no S3 link is signed here. Existing media APIs recheck ACL.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response(null, { status: 401, headers });
  const input = new URL(request.url);
  if ([...input.searchParams.keys()].join(",") !== "url")
    return new Response(null, { status: 400, headers });
  const target = input.searchParams.get("url") ?? "";
  const publicFeed = process.env.FEED_BUCKET_PUBLIC === "true"
    ? /^https:\/\/([a-z0-9-]+\.begetcdn\.cloud)$/.exec(process.env.FEED_CDN_BASE_URL ?? "")?.[1]
    : undefined;
  const allowedHosts = [...legacyHosts,
    ...(process.env.GALLERY_CDN_REDIRECT_ENABLED === "true" ? [newGalleryHost] : []),
    ...(publicFeed ? [publicFeed] : []),
  ];
  if (!isTrustedCdnProbeUrl(target, allowedHosts))
    return new Response(null, { status: 400, headers });
  try {
    const response = await fetch(target, {
      method: "HEAD", cache: "no-store", credentials: "omit", redirect: "manual",
      signal: AbortSignal.timeout(6500),
    });
    // Pass 403/404 through unmodified: a failed CDN authorization is NOT an outage.
    return new Response(null, { status: response.status, headers });
  } catch {
    // Timeout or network error is an outage. Never provide a storage URL here.
    return new Response(null, { status: 503, headers });
  }
}

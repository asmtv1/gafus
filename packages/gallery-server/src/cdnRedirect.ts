import { constantTimeEqual } from "@gafus/gallery-storage/cdn";
import { originKey } from "@gafus/gallery-storage/keys";
import { signGalleryCloudruCdnOrigin } from "@gafus/gallery-storage";

/**
 * Beget Secure Token validates the user's URL at the edge, including cache HIT.
 * This separate static origin header restricts use of the presigner to Beget.
 * The API never reads or returns photo bytes.
 */
export async function galleryCdnRedirectResponse(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  sign: (key: string, method: "GET" | "HEAD") => Promise<string> = (key, method) =>
    signGalleryCloudruCdnOrigin(key, method, env),
): Promise<Response> {
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED !== "true") return notFound();
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();
  const secret = env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET ?? "";
  const provided = request.headers.get("x-gafus-gallery-origin-secret") ?? "";
  if (!/^[A-Za-z0-9]{32,128}$/.test(secret) || !constantTimeEqual(provided, secret))
    return notFound();

  let key: string;
  try {
    // Validate the *unparsed* path; URL.pathname normalizes ../ before we can reject it.
    const raw = request.url;
    const pathname = raw.match(/^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?[^#]*)?$/)?.[1];
    if (!pathname || raw.includes("?") || /%|\\|\/\.|\/\//.test(pathname)) return notFound();
    key = originKey(pathname);
  } catch { return notFound(); }

  try {
    const target = new URL(await sign(key, request.method));
    if (target.protocol !== "https:" || target.hostname !== "s3.cloud.ru" ||
        target.pathname !== `/gafus-gallery-private/${key}` ||
        !/^[a-f0-9]{64}$/.test(target.searchParams.get("X-Amz-Signature") ?? "") ||
        target.searchParams.get("X-Amz-Expires") !== "60") return notFound();
    return new Response(null, { status: 307, headers: {
      Location: target.href,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

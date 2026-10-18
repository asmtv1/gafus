import { constantTimeEqual } from "@gafus/gallery-storage/cdn";
import { assertFinalKey } from "@gafus/gallery-storage/keys";
import { signGalleryCloudruRedirectProbe } from "@gafus/gallery-storage";

const TEST_PATH = "/__gafus_gallery_redirect_probe__/fixture.webp";

/** Explicit opt-in diagnostic; production never enables this route by default. */
export async function galleryRedirectProbeResponse(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  sign: (key: string, method: "GET" | "HEAD") => Promise<string> = (key, method) =>
    signGalleryCloudruRedirectProbe(key, method, env),
): Promise<Response> {
  const deny = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (env.GALLERY_REDIRECT_PROBE_ENABLED !== "true") return deny();
  const url = new URL(request.url);
  if (url.pathname !== TEST_PATH || url.search || request.method !== "GET" && request.method !== "HEAD") return deny();
  const secret = env.GALLERY_REDIRECT_PROBE_ORIGIN_SECRET ?? "";
  const supplied = request.headers.get("x-gafus-gallery-redirect-probe") ?? "";
  if (secret.length < 32 || !constantTimeEqual(supplied, secret)) return deny();
  const key = env.GALLERY_REDIRECT_PROBE_OBJECT_KEY ?? "";
  try { assertFinalKey(key); } catch { return deny(); }
  // Only the known Beget synthetic fixture shape, never a real user's album.
  if (!/^albums\/beget-smoke-([a-f0-9]{32})\/beget-smoke-\1\/photos\/\1\/full\.webp$/.test(key)) return deny();
  try {
    const target = new URL(await sign(key, request.method as "GET" | "HEAD"));
    if (target.protocol !== "https:" || target.hostname !== "s3.cloud.ru" ||
        !target.pathname.startsWith("/gafus-gallery-private/") ||
        !target.searchParams.has("X-Amz-Signature")) return deny();
    return new Response(null, { status: 307, headers: {
      Location: target.href, "Cache-Control": "private, no-store", "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

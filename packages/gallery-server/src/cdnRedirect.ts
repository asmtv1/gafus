import { constantTimeEqual, verifyGalleryCdnToken } from "@gafus/gallery-storage/cdn";
import { originKey } from "@gafus/gallery-storage/keys";
import { signGalleryCloudruCdnOrigin } from "@gafus/gallery-storage";

/**
 * Beget Secure Token validates the user's URL at the edge, including cache HIT.
 * This separate static origin header restricts use of the presigner to Beget.
 * Beget keeps its 307 contract. The explicit Yandex origin mode streams final
 * WebP only, without requiring paid origin shielding or exposing S3 presigns.
 */
export async function galleryCdnRedirectResponse(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  sign: (key: string, method: "GET" | "HEAD") => Promise<string> = (key, method) =>
    signGalleryCloudruCdnOrigin(key, method, env),
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED !== "true") return notFound();
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();
  const secret = env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET ?? "";
  const provided = request.headers.get("x-gafus-gallery-origin-secret") ?? "";
  if (!/^[A-Za-z0-9]{32,128}$/.test(secret) || !constantTimeEqual(provided, secret))
    return notFound();

  const mode = request.headers.get('x-gafus-gallery-origin-mode');
  const stream = mode === 'yandex-stream-v1';
  if (mode !== null && !stream) return notFound();
  let key: string;
  try {
    // Validate the *unparsed* path; URL.pathname normalizes ../ before we can reject it.
    const raw = request.url;
    const pathname = raw.match(/^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?[^#]*)?$/)?.[1];
    if (!pathname || /%|\\|\/\.|\/\//.test(pathname)) return notFound();
    key = originKey(pathname);
    if (stream || raw.includes("?")) {
      const query = new URL(raw).search;
      if (!stream || !/^\?md5=[A-Za-z0-9_-]{22}&expires=\d{10}$/.test(query)) return notFound();
      const params = new URLSearchParams(query);
      if (!verifyGalleryCdnToken(pathname, { md5: params.get("md5") ?? undefined, expires: params.get("expires") ?? undefined }, env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? "")) return notFound();
    }
  } catch { return notFound(); }

  try {
    const target = new URL(await sign(key, request.method));
    if (target.protocol !== "https:" || target.hostname !== "s3.cloud.ru" ||
        target.pathname !== `/gafus-gallery-private/${key}` ||
        !/^[a-f0-9]{64}$/.test(target.searchParams.get("X-Amz-Signature") ?? "") ||
        target.searchParams.get("X-Amz-Expires") !== "60") return notFound();
    if (stream) {
      const range = request.headers.get('range');
      if (range && !/^bytes=(?:\d{1,9}-\d{0,9}|-\d{1,9})$/.test(range)) return new Response(null, {status: 416, headers: {'Cache-Control':'private, no-store'}});
      const upstream = await fetcher(target.href, {method:request.method, headers:range ? {Range:range} : {}, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(12_000)});
      const reject = (status: number) => { void upstream.body?.cancel(); return new Response(null,{status,headers:{'Cache-Control':'private, no-store'}}); };
      if (upstream.status === 404) return reject(404);
      if (upstream.status === 416) return reject(416);
      if (upstream.status !== 200 && upstream.status !== 206) return reject(503);
      const length=Number(upstream.headers.get('content-length'));
      if (!Number.isSafeInteger(length) || length<1 || length>10*1024*1024 || upstream.headers.get('content-type')?.split(';')[0] !== 'image/webp') return reject(503);
      const headers=new Headers({'Content-Type':'image/webp','Content-Length':String(length),'Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      if (upstream.status===206) {
        const contentRange=upstream.headers.get('content-range')??'';
        const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
        if(!range||!match||Number(match[2])-Number(match[1])+1!==length||Number(match[3])>10*1024*1024||Number(match[2])>=Number(match[3]))return reject(503);
        headers.set('Content-Range',contentRange);
      }
      if(request.method==='GET' && !upstream.body)return reject(503);
      return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
    }
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

/** Image onError hides HTTP status. Never bypass CDN 403/404 by guessing S3. */
const variant = /^\/questions\/uploads\/questions\/v2\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/image\/[sm]\.webp$/i;

/** Check only the exact CDN variant and public S3 object returned by Questions V2. */
export async function allowQuestionsS3Fallback(
  cdnUrl: string, fallbackUrl?: string,
  http: typeof fetch = fetch,
  nativeNetwork = false,
): Promise<boolean> {
  if (!fallbackUrl) return false;
  let primary: URL, fallback: URL;
  try {primary = new URL(cdnUrl);fallback = new URL(fallbackUrl);}
  catch {return false;}
  if (primary.protocol !== "https:" || primary.port || primary.username ||
      primary.password || primary.search || primary.hash ||
      primary.hostname !== "ebiteskukingusk.begetcdn.cloud" ||
      !variant.test(primary.pathname) ||
      fallback.origin !== "https://gafus-questions-public.s3.cloud.ru" ||
      fallback.username || fallback.password || fallback.search || fallback.hash ||
      fallback.pathname !== primary.pathname) return false;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    // Web callers use the authenticated same-origin Hono status probe to
    // distinguish DNS failures from 403/404 and ambiguous browser CORS.
    // Native HEAD has no CORS ambiguity and may recover on network errors.
    const status = await Promise.race<number | null>([
      http(primary.toString(), {method:"HEAD",credentials:"omit",cache:"no-store",
        redirect:"error",signal:controller.signal}).then(res => res.status),
      new Promise<null>(resolve => {
        timeout = setTimeout(() => {timedOut = true;controller.abort();resolve(null);}, 4_000);
      }),
    ]);
    return status === 410 || (status !== null && status >= 500 && status <= 599) || status === null && timedOut && nativeNetwork;
  } catch {return nativeNetwork;}
  finally {if (timeout !== undefined) clearTimeout(timeout);controller.abort();}
}

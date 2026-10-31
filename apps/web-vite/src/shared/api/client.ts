/** All Web API requests use a same-origin, relative /api/v1 URL.
 * Dev proxy destinations are selected exclusively by guarded Vite config.
 */
/** Only the project-isolated MinIO is permitted over HTTP in local-hono
 * development. Never relax HTTPS for arbitrary sites or production storage.
 * The exact browser origin, port, bucket and signature gate must all match.
 * Pure address validation: NEVER log/serialize a short-lived signed URL.
 */
export function isolatedNonprodBrowserS3Url(
  raw: string, kind: "documents" | "gallery" | "feed" | "questions",
  operation: "form-post" | "signed-get",
  pageOrigin = typeof window === "undefined" ? "" : window.location.origin,
): boolean {
  // Only the dedicated WEB4 dev bundle on its exact own port can use 9500.
  const web4 = import.meta.env.DEV &&
    import.meta.env.VITE_WEB4_PRIVATE_S3 === "1" &&
    pageOrigin === "http://127.0.0.1:5504";
  const original = import.meta.env.DEV && pageOrigin === "http://127.0.0.1:5173" &&
    import.meta.env.VITE_WEB4_PRIVATE_S3 !== "1";
  const questionsQa = import.meta.env.DEV &&
    import.meta.env.VITE_QUESTIONS_LOCAL_QA === "1" &&
    pageOrigin === "http://127.0.0.1:5507" && kind === "questions";
  if ((!web4 && !original && !questionsQa) || typeof raw !== "string" || raw.length > 4096) return false;
  const bucket = web4 ? `gafus-refactor-web4-${kind}-test` : `gafus-refactor-${kind}-test`;
  try {
    const url = new URL(raw);
    if (url.origin !== (web4 ? "http://127.0.0.1:9500" : "http://127.0.0.1:9000") ||
        url.protocol !== "http:" || url.username || url.password || url.hash)
      return false;
    if (operation === "form-post")
      return (url.pathname === `/${bucket}` || url.pathname === `/${bucket}/`) &&
        !url.search;
    return url.pathname.startsWith(`/${bucket}/`) &&
      url.pathname.length > bucket.length + 2 &&
      url.searchParams.has("X-Amz-Signature") &&
      url.searchParams.has("X-Amz-Expires");
  } catch { return false; }
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// A short-lived access cookie can expire while a tab stays open. The refresh
// cookie normally survives it. Coalesce refresh across all Web read requests;
// never expose refresh tokens or replay writes.
let refreshEpoch = 0;
let refreshInFlight: Promise<void> | null = null;

export function refreshSessionCookie(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = apiRequest<void>("/api/v1/auth/refresh", {
    method: "POST", json: {}, browserAuth: true,
  }).then(
    () => { refreshEpoch += 1; refreshInFlight = null; },
    error => { refreshInFlight = null; throw error; },
  );
  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: { method?: ApiMethod; json?: unknown; browserAuth?: boolean;
    credentials?: "include" | "omit"; expectedStatus?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const basicPath = /^\/api\/v1\/[a-z0-9/_-]+(?:\?[a-z0-9=&%._-]+)?$/i.test(path);
  // The existing article detail contract accepts Cyrillic slugs. Permit ONLY
  // their canonical encodeURIComponent form, not encoded delimiters or a
  // general relaxation of the shared same-origin API path allowlist.
  let encodedArticlePath = false;
  if (!basicPath && path.startsWith("/api/v1/articles/")) {
    const prefix = "/api/v1/articles/";
    const articleSuffix = path.slice(prefix.length);
    // Original Hono supports POST /articles/:slug/view; the canonical
    // Cyrillic slug must be validated before its *exact* /view suffix.
    const view = articleSuffix.endsWith("/view");
    const encodedSlug = view ? articleSuffix.slice(0, -"/view".length) : articleSuffix;
    try {
      const slug = decodeURIComponent(encodedSlug);
      encodedArticlePath = /^[\p{L}\p{N}_-]{1,120}$/u.test(slug) &&
        encodeURIComponent(slug) === encodedSlug;
    } catch {
      encodedArticlePath = false;
    }
  }
  if (!basicPath && !encodedArticlePath) {
    throw new Error("Only relative /api/v1 paths are allowed");
  }
  if (options.browserAuth && options.credentials === "omit") {
    throw new Error("Authenticated cookie requests cannot omit credentials");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.json !== undefined) headers["Content-Type"] = "application/json";
  if (options.browserAuth) headers["X-Gafus-Auth-Transport"] = "cookie";
  const method = options.method ?? "GET";
  const requestInit: RequestInit = {
    method,
    headers,
    credentials: options.credentials ?? "include",
    cache: "no-store",
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
  };
  const observedRefreshEpoch = refreshEpoch;
  let response = await fetch(path, requestInit);
  // Refresh and retry only a cookie-backed GET, at most once. Never retry
  // POST/PATCH/PUT/DELETE (a failed response may follow a committed write),
  // auth routes, or explicitly unauthenticated calls.
  if (response.status === 401 && method === "GET" &&
    options.credentials !== "omit" && !path.startsWith("/api/v1/auth/") &&
    !path.startsWith("/api/v1/public/") &&
    !options.signal?.aborted) {
    let renewed = refreshEpoch !== observedRefreshEpoch;
    if (!renewed) {
      try {
        await refreshSessionCookie();
        renewed = true;
      } catch (error) {
        // An invalid refresh cookie really is signed out. Preserve the
        // original 401. A conflict, network failure or 5xx is *not* logout.
        if (!(error instanceof ApiError && [400, 401, 403].includes(error.status))) {
          throw error;
        }
      }
    }
    if (renewed && !options.signal?.aborted) response = await fetch(path, requestInit);
  }
  // Stock Hono authRateLimiter can return an HTML/text 429. Do not parse it
  // as JSON, claim a logout succeeded, leak backend text or retry a POST.
  if (response.status === 429) {
    throw new ApiError(429, "Слишком много запросов. Попробуйте позже.", "RATE_LIMITED");
  }
  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new ApiError(response.status, "Некорректный ответ API", "INVALID_RESPONSE");
  }
  if (!payload || typeof payload !== "object" ||
    typeof payload.success !== "boolean") {
    throw new ApiError(response.status, "Некорректный ответ API", "INVALID_RESPONSE");
  }
  if (!response.ok || payload.success !== true) {
    throw new ApiError(response.status, payload.error ?? "Ошибка API", payload.code);
  }
  // An exact 201 ACK is required for potentially committed POST actions.
  // The default client contract remains unchanged for legacy consumers.
  if (options.expectedStatus !== undefined && response.status !== options.expectedStatus) {
    throw new ApiError(response.status,
      "Ответ API не подтверждает ожидаемый HTTP-статус", "STATUS_MISMATCH");
  }
  return payload.data as T;
}

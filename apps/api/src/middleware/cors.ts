/**
 * CORS Middleware
 * Настройка разрешённых origins для web и mobile клиентов
 */
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

const ALLOWED_ORIGINS = [
  // Production
  "https://gafus.ru",
  "https://www.gafus.ru",
  "https://trainer-panel.gafus.ru",
  "https://adminka.gafus.ru",
  // Development
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3003",
];

// Production cookie origins remain unchanged. Isolated Refactor can explicitly
// opt into a single local browser Origin without trusting other HTTP origins.
export const ALLOWED_BROWSER_ORIGINS = new Set(
  ALLOWED_ORIGINS.filter((origin) => origin.startsWith("https://")),
);

const LOCAL_REFACTOR_BROWSER_ORIGIN = "http://127.0.0.1:5173";
// The admin and trainer Vite panels share this local-only, loopback-bound
// Hono instance. Keep these exact origins separate from production and from
// special-purpose QA servers which use only the original 5173 origin.
const LOCAL_REFACTOR_STAFF_BROWSER_ORIGINS = new Set([
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
]);

export function isIsolatedRefactorBrowserOrigin(origin: string): boolean {
  const normalLocal = (
    origin === LOCAL_REFACTOR_BROWSER_ORIGIN ||
    LOCAL_REFACTOR_STAFF_BROWSER_ORIGINS.has(origin)
  ) && process.env.API_PORT === "3001";
  // Chat 2.0 manual QA runs behind the SAME loopback Vite origin, but on
  // its own Hono port. Require the exact additional dev-only cutover gate.
  const chat2Manual = origin === LOCAL_REFACTOR_BROWSER_ORIGIN &&
    process.env.API_PORT === "3003" &&
    process.env.GAFUS_CHAT2_LOCAL_MANUAL_TEST === "1" &&
    process.env.CHAT2_API_ENABLED === "enabled";
  // Gallery-only Hono is a separate, WORK/S3-isolated localhost process.
  // This grants the *same* Vite cookie Origin, never any foreign/prod origin.
  const isolatedGallery = origin === LOCAL_REFACTOR_BROWSER_ORIGIN &&
    process.env.API_PORT === "3601" &&
    process.env.GAFUS_GALLERY_ISOLATED_HONO === "1" &&
    process.env.GALLERY_ENABLED === "true" &&
    process.env.FEED_ENABLED === "false";
  // WEB-1 screenshot tests may run alongside another Refactor agent's
  // localhost service. This is a separate, explicit nonproduction opt-in;
  // it never adds an origin to the production allowlist.
  const web1IsolatedAlt = origin === "http://127.0.0.1:5373" &&
    process.env.API_PORT === "3301" &&
    process.env.GAFUS_WEB1_ALT_HONO === "1";
  const web4Isolated = origin === "http://127.0.0.1:5504" &&
    process.env.API_PORT === "3501" &&
    process.env.GAFUS_WEB4_ISOLATED_MEDIA === "1";
  const chat2MediaQa = origin === "http://127.0.0.1:5174" &&
    process.env.API_PORT === "3001" &&
    process.env.GAFUS_CHAT2_LOCAL_MEDIA_QA === "1" &&
    process.env.CHAT2_API_ENABLED === "enabled";
  // Separate Questions V2 QA UI: only the matching isolated 3002/5507 pair.
  const questionsQa = origin === "http://127.0.0.1:5507" &&
    process.env.API_PORT === "3002" &&
    process.env.GAFUS_QUESTIONS_ISOLATED_QA === "1" &&
    process.env.QUESTIONS_V2_S3_ENDPOINT === "http://127.0.0.1:9000" &&
    process.env.QUESTIONS_V2_S3_BUCKET === "gafus-refactor-questions-test";
  const qaPort = process.env.GAFUS_QA_WEB_PORT ?? "";
  const freshBrowser = process.env.GAFUS_QA_FRESH_BROWSER_E2E === "1" &&
    /^gafusqa[a-f0-9]{12}$/.test(process.env.GAFUS_QA_PROJECT ?? "") &&
    /^[1-9][0-9]{3,4}$/.test(qaPort) && Number(qaPort) >= 1024 && Number(qaPort) <= 65535 &&
    origin === `http://127.0.0.1:${qaPort}`;
  return (freshBrowser || normalLocal || chat2Manual || isolatedGallery || web1IsolatedAlt || web4Isolated || chat2MediaQa || questionsQa) &&
    process.env.NODE_ENV === "development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
    process.env.GAFUS_LOCAL_BROWSER_AUTH === "1" &&
    process.env.API_HOST === "127.0.0.1";
}

/** Strictly disposable browser-cookie QA only.  No wildcard localhost access in dev/prod. */
export function isIsolatedQaCookieOrigin(origin: string): boolean {
  if (process.env.NODE_ENV !== "test" ||
      process.env.GAFUS_QA_COOKIE_BROWSER_ACCEPTANCE !== "1" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      process.env.API_HOST !== "127.0.0.1" ||
      process.env.FEED_ENABLED !== "false" ||
      process.env.GALLERY_ENABLED !== "false") return false;
  const run = process.env.GAFUS_QA_COOKIE_RUN ?? "";
  const port = process.env.GAFUS_QA_COOKIE_PORT ?? "";
  if (!/^[a-f0-9]{12}$/.test(run) || !/^[1-9][0-9]{3,4}$/.test(port) ||
      Number(port) > 65535) return false;
  if (!["a", "b", "c"].some(role =>
      origin === `http://qa-${role}-${run}.localhost:${port}`)) return false;
  try {
    const pg = new URL(process.env.DATABASE_URL ?? "");
    const redis = new URL(process.env.REDIS_URL ?? "");
    return pg.protocol === "postgresql:" && pg.hostname === "127.0.0.1" &&
      pg.username === "qahttp" && /^\/archqa_cookie_[a-f0-9]{12}$/.test(pg.pathname) &&
      redis.protocol === "redis:" && redis.hostname === "127.0.0.1" &&
      redis.pathname === "/0" && Number(redis.port) >= 1024 &&
      Number(pg.port) >= 1024 && Number(pg.port) !== Number(redis.port);
  } catch { return false; }
}

/** Disposable real-Web account deletion origin; never production/development. */
export function isIsolatedQaDeleteWebOrigin(origin: string): boolean {
  if (process.env.NODE_ENV !== "test" ||
      process.env.GAFUS_QA_ACCOUNT_DELETE_WEB !== "1" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
      process.env.API_HOST !== "127.0.0.1" ||
      process.env.FEED_ENABLED !== "false" ||
      process.env.GALLERY_ENABLED !== "false") return false;
  const run=process.env.GAFUS_QA_ACCOUNT_DELETE_RUN ?? "";
  const port=process.env.GAFUS_QA_ACCOUNT_DELETE_WEB_PORT ?? "";
  if(!/^[a-f0-9]{12}$/.test(run)||!/^[1-9][0-9]{3,4}$/.test(port)||Number(port)>65535) return false;
  if(!["owner","other"].some(role=>origin===`http://qa-delete-${role}-${run}.localhost:${port}`)) return false;
  try {
    const db=new URL(process.env.DATABASE_URL ?? "");
    const redis=new URL(process.env.REDIS_URL ?? "");
    return db.protocol==="postgresql:" && db.hostname==="127.0.0.1" &&
      db.username==="qahttp" && /^\/archqa_delete_[a-f0-9]{12}$/.test(db.pathname) &&
      redis.protocol==="redis:" && redis.hostname==="127.0.0.1" &&
      redis.pathname==="/0" && Number(db.port)>=1024 && Number(redis.port)>=1024 &&
      Number(db.port)!==Number(redis.port);
  } catch {return false;}
}

/**
 * Проверка origin через функцию (поддержка regex для Expo)
 */
const checkOrigin = (origin: string): string | null => {
  if (isIsolatedRefactorBrowserOrigin(origin) || isIsolatedQaCookieOrigin(origin) ||
      isIsolatedQaDeleteWebOrigin(origin)) return origin;
  // Точные совпадения
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  // Expo development patterns
  if (/^exp:\/\//.test(origin)) return origin;
  if (/^https?:\/\/(?:[a-z0-9-]+\.)+exp\.direct(?::[0-9]{1,5})?$/i.test(origin)) return origin;

  // React Native без origin (null/undefined)
  if (!origin) return "*";

  return null;
};

const existingCorsMiddleware = cors({
  origin: checkOrigin,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Device-Id", "X-Gafus-Auth-Transport",
    "X-Client-Platform", "X-Client-Version", "X-Client-Build", "X-Client-Ota-Revision", "traceparent"],
  exposeHeaders: ["X-Request-Id", "X-Trace-Id", "X-Operation-Id"],
  credentials: true,
  maxAge: 86400, // 24 hours
});

// Only explicit production and isolated authenticated origins are allowed.
// Anonymous Vite catalog CORS exception has been retired with guest browsing.
export const corsMiddleware: MiddlewareHandler = existingCorsMiddleware;

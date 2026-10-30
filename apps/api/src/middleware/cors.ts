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
  "https://trainer.gafus.ru",
  "https://admin.gafus.ru",
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

export function isIsolatedRefactorBrowserOrigin(origin: string): boolean {
  const normalLocal = origin === LOCAL_REFACTOR_BROWSER_ORIGIN &&
    process.env.API_PORT === "3001";
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
  return (normalLocal || chat2Manual || isolatedGallery || web1IsolatedAlt || web4Isolated || chat2MediaQa || questionsQa) &&
    process.env.NODE_ENV === "development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
    process.env.GAFUS_LOCAL_BROWSER_AUTH === "1" &&
    process.env.API_HOST === "127.0.0.1";
}

/**
 * Проверка origin через функцию (поддержка regex для Expo)
 */
const checkOrigin = (origin: string): string | null => {
  if (isIsolatedRefactorBrowserOrigin(origin)) return origin;
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
  allowHeaders: ["Content-Type", "Authorization", "X-Device-Id", "X-Gafus-Auth-Transport"],
  exposeHeaders: ["X-Request-Id"],
  credentials: true,
  maxAge: 86400, // 24 hours
});

// Only explicit production and isolated authenticated origins are allowed.
// Anonymous Vite catalog CORS exception has been retired with guest browsing.
export const corsMiddleware: MiddlewareHandler = existingCorsMiddleware;

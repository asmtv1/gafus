/** Browser-only cookie auth transport; native Bearer clients retain their contracts. */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ALLOWED_BROWSER_ORIGINS,
  isIsolatedRefactorBrowserOrigin,
} from "../middleware/cors.js";

const ACCESS_COOKIE = "gafus_access";
const REFRESH_COOKIE = "gafus_refresh";
const COOKIE_PATH = "/api/v1";
const ACCESS_AGE = 15 * 60;
const REFRESH_AGE = 30 * 24 * 60 * 60;

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "Lax" as const,
  path: COOKIE_PATH,
};

/** Never weaken HttpOnly or SameSite. Plain HTTP cookies are allowed ONLY for
 * the explicitly isolated Refactor browser origin and its loopback API, or the
 * pre-existing gallery-only preview. Production and ordinary dev stay Secure.
 */
function cookieSecure(c: Context): boolean {
  const strictLoopback = process.env.NODE_ENV === "development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
    process.env.GAFUS_LOCAL_BROWSER_AUTH === "1" &&
    process.env.API_HOST === "127.0.0.1";
  const adminWeb = (process.env.API_PORT === "3001" ||
    (process.env.API_PORT === "3003" &&
      process.env.GAFUS_CHAT2_LOCAL_MANUAL_TEST === "1" &&
      process.env.CHAT2_API_ENABLED === "enabled")) &&
    isIsolatedRefactorBrowserOrigin(c.req.header("origin") ?? "");
  const web1Separate = process.env.API_PORT === "3301" &&
    process.env.GAFUS_WEB1_ALT_HONO === "1" &&
    isIsolatedRefactorBrowserOrigin(c.req.header("origin") ?? "");
  const galleryOnly = process.env.API_PORT === "3601" &&
    process.env.GAFUS_GALLERY_ISOLATED_HONO === "1" &&
    process.env.GALLERY_ENABLED === "true" &&
    process.env.FEED_ENABLED === "false";
  // Exact WEB4-only Refactor browser acceptance (never production or generic localhost).
  const web4FeedLocal = process.env.API_PORT === "3501" &&
    process.env.GAFUS_WEB4_ISOLATED_MEDIA === "1" &&
    isIsolatedRefactorBrowserOrigin(c.req.header("origin") ?? "");
  const questionsQa = process.env.API_PORT === "3002" &&
    process.env.GAFUS_QUESTIONS_ISOLATED_QA === "1" &&
    isIsolatedRefactorBrowserOrigin(c.req.header("origin") ?? "");
  return !(strictLoopback && (adminWeb || web1Separate || galleryOnly || web4FeedLocal || questionsQa));
}

export function isBrowserCookieMode(c: Context): boolean {
  return c.req.header("x-gafus-auth-transport") === "cookie";
}

/** Reject null and absent Origin for ANY browser-cookie state-changing request. */
export function isTrustedBrowserOrigin(c: Context): boolean {
  const origin = c.req.header("origin");
  return origin !== undefined &&
    (ALLOWED_BROWSER_ORIGINS.has(origin) || isIsolatedRefactorBrowserOrigin(origin));
}

export function getBrowserAccessToken(c: Context): string | undefined {
  return getCookie(c, ACCESS_COOKIE);
}

export function getBrowserRefreshToken(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE);
}

export function setBrowserSession(c: Context, accessToken: string, refreshToken: string): void {
  const secure = cookieSecure(c);
  setCookie(c, ACCESS_COOKIE, accessToken, { ...cookieOptions, secure, maxAge: ACCESS_AGE });
  setCookie(c, REFRESH_COOKIE, refreshToken, { ...cookieOptions, secure, maxAge: REFRESH_AGE });
}

export function clearBrowserSession(c: Context): void {
  const secure = cookieSecure(c);
  deleteCookie(c, ACCESS_COOKIE, { path: COOKIE_PATH, secure, sameSite: "Lax", httpOnly: true });
  deleteCookie(c, REFRESH_COOKIE, { path: COOKIE_PATH, secure, sameSite: "Lax", httpOnly: true });
}

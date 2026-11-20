/**
 * Auth Middleware
 * JWT авторизация для защищённых endpoints
 */
import { createMiddleware } from "hono/factory";
import { verifyAccessToken, type AuthUser } from "@gafus/auth/jwt";
import { isRegistrationCompleted, type RegistrationContextPorts } from "@gafus/core/services/auth";
import { registrationContextPort } from "../modules/auth/composition/registration-context-instance.js";
import { getBrowserAccessToken, isTrustedBrowserOrigin } from "../lib/browser-auth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/**
 * Middleware для проверки JWT токена
 * Пропускает маршруты для HLS видео (manifest и segment), которые используют токен из query
 */
export function createAuthMiddleware(registration: RegistrationContextPorts) {
  return createMiddleware(async (c, next) => {
  const path = c.req.path;
  const unauthorized = (message: string) =>
    c.json({ success: false, error: message }, 401);

  // Public access is read-only and limited to exact URLs. Substring matching
  // would silently skip JWT for private sibling/future descendant routes.
  const publicRead = c.req.method === "GET" || c.req.method === "HEAD";

  // Legacy public mobile-app settings route (do not match /configure or /v2).
  if (publicRead && (path === "/api/v1/public/mobile-app" || path === "/public/mobile-app")) {
    await next();
    return;
  }

  // Публичный профиль по username — only the exact route is anonymous.
  if (publicRead && (
    path === "/api/v1/user/profile/public" ||
    path === "/user/profile/public" ||
    path === "/profile/public"
  )) {
    await next();
    return;
  }

  // Signed HLS playback: GET/HEAD only; neighboring video endpoints require JWT.
  const isPublicHlsRoute =
    publicRead &&
    /^\/(?:api\/v1\/)?training\/video\/[^/]+\/(?:manifest(?:\.m3u8)?|segment)$/.test(path);
  if (isPublicHlsRoute) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader && !authHeader.startsWith("Bearer ")) {
    return unauthorized("Недействительный формат авторизации");
  }

  const cookieTransport = !authHeader;
  const token = authHeader?.slice(7) ?? getBrowserAccessToken(c);
  if (!token) {
    return unauthorized("Токен не предоставлен");
  }
  // Cookies are ambient credentials: state-changing calls require a trusted Origin.
  // Bearer tokens from Expo are explicit credentials and remain backward compatible.
  if (cookieTransport && !["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !isTrustedBrowserOrigin(c)) {
    return c.json({ success: false, error: "Недоверенный Origin" }, 403);
  }

  const user = await verifyAccessToken(token);

  if (!user) {
    return unauthorized("Недействительный токен");
  }

  // A token issued before registration was finalized must not authorize a
  // provisional account. Recheck on every protected API request and prevent
  // caches from storing the rejected response for any protected route.
  if (!(await isRegistrationCompleted(user.id, registration))) {
    c.header("Cache-Control", "no-store");
    return c.json({ success: false, code: "REGISTRATION_PENDING", error: "Завершите регистрацию" }, 401);
  }

  c.set("user", user);
  await next();
  });
}

/** Production uses a concrete SQL adapter, not a Core global registry. */
export const authMiddleware = createAuthMiddleware(registrationContextPort);

/**
 * Middleware для проверки ролей
 */
export const requireRole = (...roles: AuthUser["role"][]) => {
  return createMiddleware(async (c, next) => {
    const user = c.get("user");

    if (!roles.includes(user.role)) {
      return c.json({ success: false, error: "Недостаточно прав" }, 403);
    }

    await next();
  });
};

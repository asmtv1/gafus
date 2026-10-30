/**
 * Auth Middleware
 * JWT авторизация для защищённых endpoints
 */
import { createMiddleware } from "hono/factory";
import { verifyAccessToken, type AuthUser } from "@gafus/auth/jwt";
import { isRegistrationCompleted } from "@gafus/core/services/auth";
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
export const authMiddleware = createMiddleware(async (c, next) => {
  const path = c.req.path;
  // A private chat may be rejected before its no-store route runs.
  // Limit this response shape change to the exact private Chat subtree.
  const privateChatAuth =
    path === "/api/v1/cynologist-chat" || path.startsWith("/api/v1/cynologist-chat/");
  const unauthorized = (message: string) => {
    if (privateChatAuth) {
      c.header("Cache-Control", "no-store");
      return c.json({ success: false, code: "UNAUTHORIZED", error: message }, 401);
    }
    return c.json({ success: false, error: message }, 401);
  };

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

  // A JWT predating a failed/incomplete VK registration must not authorize a
  // provisional account. This is deliberately checked on every protected API
  // request, not just at token creation.
  if (!(await isRegistrationCompleted(user.id))) {
    // This rejection happens before the Chat dispatcher can set its headers.
    if (privateChatAuth) c.header("Cache-Control", "no-store");
    return c.json({ success: false, code: "REGISTRATION_PENDING", error: "Завершите регистрацию через VK ID" }, 401);
  }

  c.set("user", user);
  await next();
});

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

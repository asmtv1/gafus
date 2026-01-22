/**
 * Auth Middleware
 * JWT авторизация для защищённых endpoints
 */
import { createMiddleware } from "hono/factory";
import { verifyAccessToken, type AuthUser } from "@gafus/auth/jwt";

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
  
  // Пропускаем маршруты для HLS видео - они используют токен из query параметра
  if (path.includes("/training/video/") && (path.includes("/manifest") || path.includes("/segment"))) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Токен не предоставлен" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await verifyAccessToken(token);

  if (!user) {
    return c.json({ success: false, error: "Недействительный токен" }, 401);
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

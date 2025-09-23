import { NextResponse } from "next/server";
import { createWebLogger } from "@gafus/logger";

import { verifyCSRFToken } from "./utils";

import type { NextRequest } from "next/server";

// Создаем логгер для CSRF Middleware
const logger = createWebLogger('csrf-middleware');

// Конфигурация CSRF защиты
const CSRF_CONFIG = {
  // Строгий режим (в production всегда true)
  strictMode: process.env.NODE_ENV === "production" || process.env.CSRF_STRICT === "true",
  // Разрешенные заголовки для CSRF токена
  allowedHeaders: ["x-csrf-token", "x-xsrf-token"],
  // Небезопасные методы, требующие CSRF защиты
  unsafeMethods: ["POST", "PUT", "PATCH", "DELETE"] as const,
  // Исключения (пути, которые не требуют CSRF защиты)
  excludedPaths: [
    "/api/auth/", // NextAuth endpoints
    "/api/csrf-token", // CSRF token endpoint
    "/api/webhook/", // Webhook endpoints
  ],
} as const;

/**
 * Проверяет, является ли путь исключением из CSRF защиты
 */
function isExcludedPath(pathname: string): boolean {
  return CSRF_CONFIG.excludedPaths.some((path) => pathname.startsWith(path));
}

/**
 * Получает CSRF токен из заголовков запроса
 */
function getCSRFTokenFromHeaders(req: NextRequest): string | null {
  for (const headerName of CSRF_CONFIG.allowedHeaders) {
    const token = req.headers.get(headerName);
    if (token) return token;
  }
  return null;
}

/**
 * Валидирует формат CSRF токена
 */
function isValidCSRFTokenFormat(token: string): boolean {
  // Проверяем формат: salt.hash (два блока, разделенных точкой)
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [salt, hash] = parts;
  // Проверяем, что salt и hash состоят только из hex символов
  const hexRegex = /^[0-9a-f]+$/i;
  return hexRegex.test(salt) && hexRegex.test(hash) && salt.length === 32 && hash.length === 64;
}

/**
 * Логирует попытку CSRF атаки
 */
function logCSRFAttack(req: NextRequest, reason: string, token?: string): void {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    userAgent: req.headers.get("user-agent") || "Unknown",
    referer: req.headers.get("referer") || "Unknown",
    reason,
    token: token ? `${token.substring(0, 8)}...` : "None",
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "Unknown",
  };

  logger.warn("CSRF Attack Attempt", {
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "Unknown",
    userAgent: req.headers.get('user-agent') || 'unknown',
    method: req.method,
    url: req.url,
    reason: reason,
    token: token ? 'present' : 'missing',
    timestamp: new Date().toISOString()
  });
}

/**
 * Middleware для проверки CSRF токенов в API маршрутах
 */
export function withCSRFProtection(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const { pathname } = req.nextUrl;

    // Проверяем только небезопасные методы
    if (!CSRF_CONFIG.unsafeMethods.includes(req.method as "POST" | "PUT" | "PATCH" | "DELETE")) {
      return handler(req);
    }

    // Проверяем исключения
    if (isExcludedPath(pathname)) {
      return handler(req);
    }

    // Получаем CSRF токен из заголовков
    const csrfToken = getCSRFTokenFromHeaders(req);

    // Проверяем наличие токена
    if (!csrfToken) {
      logCSRFAttack(req, "Missing CSRF token");

      if (CSRF_CONFIG.strictMode) {
        return NextResponse.json(
          {
            error: "CSRF token required",
            code: "CSRF_TOKEN_MISSING",
          },
          { status: 403 },
        );
      } else {
        logger.warn("CSRF token missing, but allowing in non-strict mode", {
          method: req.method,
          url: req.url,
          strictMode: CSRF_CONFIG.strictMode
        });
        return handler(req);
      }
    }

    // Проверяем формат токена
    if (!isValidCSRFTokenFormat(csrfToken)) {
      logCSRFAttack(req, "Invalid CSRF token format", csrfToken);

      if (CSRF_CONFIG.strictMode) {
        return NextResponse.json(
          {
            error: "Invalid CSRF token format",
            code: "CSRF_TOKEN_INVALID_FORMAT",
          },
          { status: 403 },
        );
      } else {
        logger.warn("Invalid CSRF token format, but allowing in non-strict mode", {
          method: req.method,
          url: req.url,
          tokenLength: csrfToken.length,
          strictMode: CSRF_CONFIG.strictMode
        });
        return handler(req);
      }
    }

    // Проверяем валидность токена
    try {
      const isValid = await verifyCSRFToken(csrfToken);

      if (!isValid) {
        logCSRFAttack(req, "Invalid CSRF token", csrfToken);

        if (CSRF_CONFIG.strictMode) {
          return NextResponse.json(
            {
              error: "Invalid CSRF token",
              code: "CSRF_TOKEN_INVALID",
            },
            { status: 403 },
          );
        } else {
          logger.warn("Invalid CSRF token, but allowing in non-strict mode", {
            method: req.method,
            url: req.url,
            strictMode: CSRF_CONFIG.strictMode
          });
          return handler(req);
        }
      }

      // Токен валиден, логируем успешную проверку в development
      if (process.env.NODE_ENV === "development") {
        logger.success("CSRF token validated successfully", {
          method: req.method,
          url: req.url,
          tokenLength: csrfToken.length
        });
      }
    } catch (error) {
      logger.error("Error verifying CSRF token", error as Error, {
        method: req.method,
        url: req.url,
        tokenLength: csrfToken.length
      });
      logCSRFAttack(req, "CSRF verification error", csrfToken);

      if (CSRF_CONFIG.strictMode) {
        return NextResponse.json(
          {
            error: "CSRF verification failed",
            code: "CSRF_VERIFICATION_ERROR",
          },
          { status: 500 },
        );
      } else {
        logger.warn("CSRF verification error, but allowing in non-strict mode", {
          method: req.method,
          url: req.url,
          strictMode: CSRF_CONFIG.strictMode,
          error: error instanceof Error ? error.message : String(error)
        });
        return handler(req);
      }
    }

    return handler(req);
  };
}

/**
 * Создает middleware с кастомной конфигурацией
 */
export function createCSRFMiddleware(config?: Partial<typeof CSRF_CONFIG>) {
  const mergedConfig = { ...CSRF_CONFIG, ...config };

  return function withCustomCSRFProtection(
    handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
  ) {
    return async (req: NextRequest): Promise<NextResponse> => {
      // Временно заменяем глобальную конфигурацию
      const originalConfig = { ...CSRF_CONFIG };
      Object.assign(CSRF_CONFIG, mergedConfig);

      try {
        return await withCSRFProtection(handler)(req);
      } finally {
        // Восстанавливаем оригинальную конфигурацию
        Object.assign(CSRF_CONFIG, originalConfig);
      }
    };
  };
}

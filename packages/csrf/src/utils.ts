"use server";

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для CSRF
const logger = createWebLogger("csrf-utils");

const CSRF_TOKEN_NAME = "csrf-token";
const CSRF_SECRET_NAME = "csrf-secret";
const CSRF_TOKEN_VERSION = "v1"; // Версия токена для совместимости

// Конфигурация безопасности
const SECURITY_CONFIG = {
  // Размер секрета в байтах
  secretSize: 32,
  // Размер соли в байтах
  saltSize: 16,
  // Время жизни токена в секундах
  tokenLifetime: 60 * 60, // 1 час
  // Время жизни секрета в секундах
  secretLifetime: 60 * 60 * 24 * 7, // 7 дней
  // Максимальное количество попыток проверки токена
  maxVerificationAttempts: 3,
} as const;

/**
 * Генерирует криптографически стойкий случайный токен
 */
function generateSecureToken(size: number): string {
  return randomBytes(size).toString("hex");
}

/**
 * Создает хеш токена с использованием HMAC
 */
function createTokenHash(secret: string, salt: string): string {
  return createHash("sha256")
    .update(secret + salt + CSRF_TOKEN_VERSION)
    .digest("hex");
}

/**
 * Проверяет, что два токена равны с защитой от timing attacks
 */
function safeTokenCompare(token1: string, token2: string): boolean {
  if (token1.length !== token2.length) return false;

  try {
    const buffer1 = Buffer.from(token1, "hex");
    const buffer2 = Buffer.from(token2, "hex");
    return timingSafeEqual(new Uint8Array(buffer1), new Uint8Array(buffer2));
  } catch {
    return false;
  }
}

/**
 * Валидирует формат токена
 */
function isValidTokenFormat(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [salt, hash] = parts;
  const hexRegex = /^[0-9a-f]+$/i;

  return (
    hexRegex.test(salt) &&
    hexRegex.test(hash) &&
    salt.length === SECURITY_CONFIG.saltSize * 2 &&
    hash.length === 64
  );
}

/**
 * Генерирует CSRF токен для текущей сессии
 */
export async function generateCSRFToken(): Promise<string> {
  try {
    const cookiesStore = await cookies();

    // Получаем или создаём секрет
    let secret = cookiesStore.get(CSRF_SECRET_NAME)?.value;
    if (!secret) {
      secret = generateSecureToken(SECURITY_CONFIG.secretSize);
      cookiesStore.set(CSRF_SECRET_NAME, secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: SECURITY_CONFIG.secretLifetime,
        path: "/",
      });
    }

    // Генерируем соль и хеш
    const salt = generateSecureToken(SECURITY_CONFIG.saltSize);
    const hash = createTokenHash(secret, salt);

    const token = `${salt}.${hash}`;

    // Сохраняем токен в cookie
    cookiesStore.set(CSRF_TOKEN_NAME, token, {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL?.includes("https://"),
      sameSite: "strict",
      maxAge: SECURITY_CONFIG.tokenLifetime,
      path: "/",
    });

    return token;
  } catch (error) {
    logger.error("Error generating CSRF token", error as Error, {
      secretSize: SECURITY_CONFIG.secretSize,
      saltSize: SECURITY_CONFIG.saltSize,
    });

    // В случае ошибки генерируем fallback токен
    // Это менее безопасно, но обеспечивает работоспособность
    const fallbackToken =
      generateSecureToken(SECURITY_CONFIG.saltSize) + "." + generateSecureToken(32);
    return fallbackToken;
  }
}

/**
 * Проверяет валидность CSRF токена
 */
export async function verifyCSRFToken(token: string): Promise<boolean> {
  try {
    // Проверяем формат токена
    if (!isValidTokenFormat(token)) {
      logger.warn("Invalid CSRF token format", {
        tokenLength: token.length,
        expectedFormat: "base64.base64",
      });
      return false;
    }

    const cookiesStore = await cookies();

    const secret = cookiesStore.get(CSRF_SECRET_NAME)?.value;
    const storedToken = cookiesStore.get(CSRF_TOKEN_NAME)?.value;

    if (!secret || !storedToken) {
      logger.warn("Missing CSRF secret or stored token", {
        hasSecret: !!secret,
        hasStoredToken: !!storedToken,
      });
      return false;
    }

    // Проверяем, что токены совпадают
    if (!safeTokenCompare(storedToken, token)) {
      logger.warn("CSRF token mismatch", {
        tokenLength: token.length,
        storedTokenLength: storedToken.length,
      });
      return false;
    }

    const [salt, hash] = token.split(".");
    if (!salt || !hash) {
      logger.warn("Invalid CSRF token structure", {
        tokenParts: token.split(".").length,
        expectedParts: 2,
      });
      return false;
    }

    // Проверяем хеш токена
    const expectedHash = createTokenHash(secret, salt);
    if (!safeTokenCompare(hash, expectedHash)) {
      logger.warn("CSRF token hash mismatch", {
        tokenHash: hash,
        expectedHash: expectedHash,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error verifying CSRF token", error as Error, {
      tokenLength: token.length,
    });
    return false;
  }
}

/**
 * Получает CSRF токен для клиента (только значение, без секрета)
 */
export async function getCSRFTokenForClient(): Promise<string> {
  try {
    const cookiesStore = await cookies();
    const token = cookiesStore.get(CSRF_TOKEN_NAME)?.value;

    if (!token) {
      return await generateCSRFToken();
    }

    // Проверяем валидность существующего токена
    if (await verifyCSRFToken(token)) {
      return token;
    }

    // Если токен невалиден, генерируем новый
    return await generateCSRFToken();
  } catch (error) {
    logger.error("Error getting CSRF token for client", error as Error);
    // Fallback: генерируем новый токен
    return await generateCSRFToken();
  }
}

/**
 * Принудительно обновляет CSRF токен
 */
export async function refreshCSRFToken(): Promise<string> {
  try {
    const cookiesStore = await cookies();

    // Удаляем старый токен
    cookiesStore.delete(CSRF_TOKEN_NAME);

    // Генерируем новый токен
    return await generateCSRFToken();
  } catch (error) {
    logger.error("Error refreshing CSRF token", error as Error);
    return await generateCSRFToken();
  }
}

/**
 * Проверяет, истек ли CSRF токен
 */
export async function isCSRFTokenExpired(): Promise<boolean> {
  try {
    const cookiesStore = await cookies();
    const token = cookiesStore.get(CSRF_TOKEN_NAME);

    if (!token) return true;

    // Проверяем валидность токена
    return !(await verifyCSRFToken(token.value));
  } catch (error) {
    logger.error("Error checking CSRF token expiration", error as Error);
    return true;
  }
}

/**
 * Получает информацию о CSRF токене (для отладки)
 */
export async function getCSRFTokenInfo(): Promise<{
  hasToken: boolean;
  hasSecret: boolean;
  isValid: boolean;
  isExpired: boolean;
  tokenAge?: number;
}> {
  try {
    const cookiesStore = await cookies();
    const token = cookiesStore.get(CSRF_TOKEN_NAME);
    const secret = cookiesStore.get(CSRF_SECRET_NAME);

    const hasToken = !!token?.value;
    const hasSecret = !!secret?.value;
    const isValid = hasToken && hasSecret && (await verifyCSRFToken(token.value));
    const isExpired = !isValid;

    let tokenAge: number | undefined;
    // В Next.js RequestCookie не содержит expires, поэтому используем примерное время
    // на основе времени жизни токена
    if (hasToken) {
      tokenAge = SECURITY_CONFIG.tokenLifetime;
    }

    return {
      hasToken,
      hasSecret,
      isValid,
      isExpired,
      tokenAge,
    };
  } catch (error) {
    logger.error("Error getting CSRF token info", error as Error);
    return {
      hasToken: false,
      hasSecret: false,
      isValid: false,
      isExpired: true,
    };
  }
}

/**
 * JWT Token Management
 * Генерация и верификация access/refresh токенов для API авторизации
 *
 * ВАЖНО: Защита от algorithm confusion:
 * - Всегда указывать alg: "HS256" в заголовке
 * - Всегда проверять audience
 * - Минимальная длина secret: 32 символа
 */
import { SignJWT, jwtVerify } from "jose";
import { createSecretKey, type KeyObject } from "crypto";

const JWT_ISSUER = "https://api.gafus.ru";
const JWT_AUDIENCE = "gafus-app";

// Ленивая инициализация секретов (для поддержки использования без JWT)
let accessSecret: KeyObject | null = null;
let refreshSecret: KeyObject | null = null;

function getAccessSecret(): KeyObject {
  if (!accessSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters for HS256");
    }
    accessSecret = createSecretKey(Buffer.from(secret, "utf-8"));
  }
  return accessSecret;
}

function getRefreshSecret(): KeyObject {
  if (!refreshSecret) {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("JWT_REFRESH_SECRET must be at least 32 characters");
    }
    refreshSecret = createSecretKey(Buffer.from(secret, "utf-8"));
  }
  return refreshSecret;
}

export interface AuthUser {
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
}

/**
 * Генерирует access token (15 минут)
 */
export async function generateAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getAccessSecret());
}

/**
 * Генерирует refresh token (30 дней)
 */
export async function generateRefreshToken(
  userId: string,
  tokenId: string
): Promise<string> {
  return new SignJWT({ sub: userId, jti: tokenId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getRefreshSecret());
}

/**
 * Верифицирует access token
 */
export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"], // ОБЯЗАТЕЛЬНО - защита от algorithm confusion
      clockTolerance: "30s", // Защита от расхождения времени между серверами
    });

    return {
      id: payload.sub as string,
      username: payload.username as string,
      role: payload.role as AuthUser["role"],
    };
  } catch {
    return null;
  }
}

/**
 * Верифицирует refresh token
 */
export async function verifyRefreshToken(
  token: string
): Promise<{ userId: string; tokenId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
      clockTolerance: "30s",
    });

    return {
      userId: payload.sub as string,
      tokenId: payload.jti as string,
    };
  } catch {
    return null;
  }
}

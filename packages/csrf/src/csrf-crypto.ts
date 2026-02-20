/**
 * Pure крипто-функции для CSRF (вынесены для тестируемости)
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const TOKEN_VERSION = "v1";
export const SALT_HEX_LENGTH = 32;
export const HASH_HEX_LENGTH = 64;

/**
 * Валидирует формат токена (salt.hash)
 */
export function isValidTokenFormat(
  token: string,
  saltHexLen: number = SALT_HEX_LENGTH,
  hashHexLen: number = HASH_HEX_LENGTH,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [salt, hash] = parts;
  const hexRegex = /^[0-9a-f]+$/i;

  return (
    hexRegex.test(salt) &&
    hexRegex.test(hash) &&
    salt.length === saltHexLen &&
    hash.length === hashHexLen
  );
}

/**
 * Создаёт хеш токена
 */
export function createTokenHash(
  secret: string,
  salt: string,
  version: string = TOKEN_VERSION,
): string {
  return createHash("sha256")
    .update(secret + salt + version)
    .digest("hex");
}

/**
 * Timing-safe сравнение токенов
 */
export function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  try {
    const buffer1 = Buffer.from(a, "hex");
    const buffer2 = Buffer.from(b, "hex");
    return timingSafeEqual(new Uint8Array(buffer1), new Uint8Array(buffer2));
  } catch {
    return false;
  }
}

/**
 * Генерирует криптостойкую случайную hex-строку
 */
export function generateSecureToken(byteSize: number): string {
  return randomBytes(byteSize).toString("hex");
}

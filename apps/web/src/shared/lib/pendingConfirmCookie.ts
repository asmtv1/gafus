/**
 * Cookie для ожидания подтверждения номера (после регистрации).
 * Значение — зашифрованный phone. Только в apps/web (не в core).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "pending_confirm";
const MAX_AGE = 900; // 15 мин
const ALG = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const SALT = "gafus-pending-confirm-v1";

function getKey(): Buffer {
  const secret = process.env.PENDING_CONFIRM_SECRET || "dev-secret-change-in-production";
  return scryptSync(secret, SALT, KEY_LEN);
}

function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString("base64url");
}

function decrypt(value: string): string | null {
  try {
    const buf = Buffer.from(value, "base64url");
    if (buf.length < IV_LEN + 16 + 1) return null;
    const key = getKey();
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + 16);
    const enc = buf.subarray(IV_LEN + 16);
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(enc) + decipher.final("utf8");
  } catch {
    return null;
  }
}

/**
 * Устанавливает cookie с зашифрованным phone. Вызывать в Server Action после успешной регистрации.
 */
export async function setPendingConfirmCookie(phone: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encrypt(phone), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Читает и расшифровывает phone из cookie. Возвращает null, если нет или невалидно.
 */
export async function getPendingConfirmPhone(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;
  return decrypt(value);
}

/**
 * Удаляет cookie (после успешного подтверждения).
 */
export async function deletePendingConfirmCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

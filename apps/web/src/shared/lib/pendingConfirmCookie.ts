/**
 * Cookie для ожидания подтверждения номера (после регистрации).
 * Значение — зашифрованный phone. Только в apps/web (не в core).
 */

import type { CipherGCM, DecipherGCM } from "crypto";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "pending_confirm";
const MAX_AGE = 900; // 15 мин
const ALG = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const SALT = "gafus-pending-confirm-v1";

/** Обход строгих CipherKey/BinaryLike в @types/node; Node в рантайме принимает Buffer. Один источник на границе (practice: typescript-advanced-types). */
type GcmCipher = (
  alg: string,
  key: Buffer | Uint8Array,
  iv: Buffer | Uint8Array,
) => CipherGCM;
type GcmDecipher = (
  alg: string,
  key: Buffer | Uint8Array,
  iv: Buffer | Uint8Array,
) => DecipherGCM;
const createCipherivGcm: GcmCipher = createCipheriv as unknown as GcmCipher;
const createDecipherivGcm: GcmDecipher = createDecipheriv as unknown as GcmDecipher;

/** Buffer.concat в @types/node ожидает Uint8Array[]; приводим список Buffer на границе. */
function concatBuffers(list: Buffer[]): Buffer {
  return Buffer.concat(list as unknown as Uint8Array[]);
}

function getKey(): Buffer {
  const secret = process.env.PENDING_CONFIRM_SECRET || "dev-secret-change-in-production";
  return scryptSync(secret, SALT, KEY_LEN);
}

function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipherivGcm(ALG, key, iv);
  const enc = concatBuffers([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return concatBuffers([iv, authTag, enc]).toString("base64url");
}

function decrypt(value: string): string | null {
  try {
    const buf = Buffer.from(value, "base64url");
    if (buf.length < IV_LEN + 16 + 1) return null;
    const key = getKey();
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + 16);
    const enc = buf.subarray(IV_LEN + 16);
    const decipher = createDecipherivGcm(ALG, key, iv);
    decipher.setAuthTag(authTag as unknown as NodeJS.ArrayBufferView);
    return decipher.update(enc as unknown as NodeJS.ArrayBufferView) + decipher.final("utf8");
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

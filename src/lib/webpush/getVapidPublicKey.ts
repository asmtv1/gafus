"use server";
/**
 * Серверный экшн, возвращает публичный VAPID-ключ из окружения.
 */
export async function getVapidPublicKey(): Promise<string> {
  if (!process.env.VAPID_PUBLIC_KEY) {
    throw new Error("VAPID_PUBLIC_KEY is not set in env");
  }
  return process.env.VAPID_PUBLIC_KEY;
}

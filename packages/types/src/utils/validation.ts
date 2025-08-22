// Утилиты валидации для push-уведомлений

import type { PushSubscriptionJSON, PushSubscriptionKeys } from "../data/push";

/**
 * Валидирует VAPID публичный ключ
 * VAPID ключи должны быть в формате URL-safe base64
 */
export function validateVapidPublicKey(key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  // VAPID публичный ключ должен быть достаточно длинным (обычно 65-88 символов)
  if (key.length < 65) {
    return false;
  }

  // Проверяем что ключ содержит только допустимые символы для base64url
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return base64urlPattern.test(key);
}

/**
 * Валидирует VAPID приватный ключ
 */
export function validateVapidPrivateKey(key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  // VAPID приватный ключ должен быть 43 символа в base64url формате
  if (key.length !== 43) {
    return false;
  }

  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return base64urlPattern.test(key);
}

/**
 * Валидирует ключи push-подписки
 */
export function validatePushSubscriptionKeys(keys: unknown): keys is PushSubscriptionKeys {
  if (!keys || typeof keys !== "object") {
    return false;
  }

  const typedKeys = keys as Record<string, unknown>;

  return (
    typeof typedKeys.p256dh === "string" &&
    typeof typedKeys.auth === "string" &&
    typedKeys.p256dh.length > 0 &&
    typedKeys.auth.length > 0
  );
}

/**
 * Валидирует push-подписку
 */
export function validatePushSubscription(
  subscription: unknown,
): subscription is PushSubscriptionJSON {
  if (!subscription || typeof subscription !== "object") {
    return false;
  }

  const typedSub = subscription as Record<string, unknown>;

  return (
    typeof typedSub.endpoint === "string" &&
    typedSub.endpoint.length > 0 &&
    isValidUrl(typedSub.endpoint) &&
    validatePushSubscriptionKeys(typedSub.keys)
  );
}

/**
 * Валидирует URL endpoint
 */
function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Валидирует email для VAPID subject
 */
export function validateVapidSubject(subject: string): boolean {
  if (!subject || typeof subject !== "string") {
    return false;
  }

  // Должен быть либо mailto:email, либо https://url
  if (subject.startsWith("mailto:")) {
    const email = subject.substring(7);
    return isValidEmail(email);
  }

  if (subject.startsWith("https://")) {
    return isValidUrl(subject);
  }

  return false;
}

/**
 * Простая валидация email
 */
function isValidEmail(email: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

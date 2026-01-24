"use server";

import { validateVapidPublicKey } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-push-actions");

/**
 * Получает публичный VAPID ключ для Web Push уведомлений
 *
 * @returns Объект с публичным ключом и информацией о его валидности
 */
export async function getPublicKeyAction() {
  const key = process.env.VAPID_PUBLIC_KEY;

  if (!key) {
    logger.warn("⚠️ getPublicKeyAction: VAPID_PUBLIC_KEY is not defined in environment variables");
    return {
      publicKey: null,
      isDefined: false,
      isValid: false,
    };
  }

  const isValid = validateVapidPublicKey(key);

  if (!isValid) {
    logger.error(
      "❌ getPublicKeyAction: VAPID_PUBLIC_KEY is not valid format",
      new Error("Invalid VAPID key format"),
    );
    return {
      publicKey: null,
      isDefined: true,
      isValid: false,
    };
  }

  return {
    publicKey: key,
    isDefined: true,
    isValid: true,
  };
}

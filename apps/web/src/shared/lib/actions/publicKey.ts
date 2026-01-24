"use server";

import { validateVapidPublicKey } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-public-key-action");

export async function getPublicKeyAction() {
  const key = process.env.VAPID_PUBLIC_KEY;

  if (!key) {
    logger.warn("⚠️ getPublicKeyAction: VAPID_PUBLIC_KEY is not defined in environment variables", {
      operation: "warn",
    });
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
      { operation: "invalid_vapid_key" },
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

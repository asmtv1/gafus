"use server";

import { createWebLogger } from "@gafus/logger";
import { validateVapidPublicKey } from "@gafus/types";
import { unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-public-key-action");

export async function getPublicKeyAction() {
  try {
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
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getPublicKeyAction: неожиданная ошибка",
      error instanceof Error ? error : new Error(String(error)),
      { operation: "unexpected" },
    );
    return {
      publicKey: null,
      isDefined: false,
      isValid: false,
    };
  }
}

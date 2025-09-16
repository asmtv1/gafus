"use server";

import { validateVapidPublicKey } from "@gafus/types";

export async function getPublicKeyAction() {
  const key = process.env.VAPID_PUBLIC_KEY;
  

  if (!key) {
    console.warn("⚠️ getPublicKeyAction: VAPID_PUBLIC_KEY is not defined in environment variables");
    return {
      publicKey: null,
      isDefined: false,
      isValid: false,
    };
  }

  const isValid = validateVapidPublicKey(key);
  

  if (!isValid) {
    console.error("❌ getPublicKeyAction: VAPID_PUBLIC_KEY is not valid format");
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

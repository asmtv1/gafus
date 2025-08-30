"use server";

import { validateVapidPublicKey } from "@gafus/types";

export async function getPublicKeyAction() {
  console.log("🚀 getPublicKeyAction: Начинаем получение VAPID публичного ключа");
  
  const key = process.env.VAPID_PUBLIC_KEY;
  console.log("🔧 getPublicKeyAction: VAPID_PUBLIC_KEY из env:", !!key);

  if (!key) {
    console.warn("⚠️ getPublicKeyAction: VAPID_PUBLIC_KEY is not defined in environment variables");
    return {
      publicKey: null,
      isDefined: false,
      isValid: false,
    };
  }

  console.log("🔧 getPublicKeyAction: Валидируем VAPID ключ...");
  const isValid = validateVapidPublicKey(key);
  console.log("✅ getPublicKeyAction: Валидация VAPID ключа:", isValid);

  if (!isValid) {
    console.error("❌ getPublicKeyAction: VAPID_PUBLIC_KEY is not valid format");
    return {
      publicKey: null,
      isDefined: true,
      isValid: false,
    };
  }

  console.log("✅ getPublicKeyAction: VAPID ключ успешно получен и валидирован");
  return {
    publicKey: key,
    isDefined: true,
    isValid: true,
  };
}

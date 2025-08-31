"use client";

import serviceWorkerManager from "@shared/utils/serviceWorkerManager";
import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Регистрируем Service Worker при загрузке приложения
    if (serviceWorkerManager.isSupported()) {
      serviceWorkerManager.register()
        .then(() => {
          console.log("✅ Service Worker зарегистрирован при загрузке приложения");
        })
        .catch((error) => {
          console.warn("⚠️ Не удалось зарегистрировать Service Worker при загрузке:", error);
        });
    }
  }, []);

  return null;
}

"use client";

import serviceWorkerManager from "@shared/utils/serviceWorkerManager";
import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Мгновенная регистрация Service Worker
    if (serviceWorkerManager.isSupported()) {
      serviceWorkerManager.register()
        .then(() => {
          console.warn("✅ Service Worker зарегистрирован");
        })
        .catch((error) => {
          console.warn("⚠️ Не удалось зарегистрировать Service Worker:", error);
        });
    }
  }, []);

  return null;
}

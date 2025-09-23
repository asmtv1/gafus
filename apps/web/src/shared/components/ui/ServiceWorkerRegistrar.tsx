"use client";

import serviceWorkerManager from "@shared/utils/serviceWorkerManager";
import { createWebLogger } from "@gafus/logger";
import { useEffect } from "react";

// Создаем логгер для ServiceWorkerRegistrar
const logger = createWebLogger('web-service-worker-registrar');

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Мгновенная регистрация Service Worker
    if (serviceWorkerManager.isSupported()) {
      serviceWorkerManager.register()
        .catch((error) => {
          logger.warn("⚠️ Не удалось зарегистрировать Service Worker", {
            operation: 'service_worker_registration_failed',
            error: error instanceof Error ? error.message : String(error)
          });
        });
    }
  }, []);

  return null;
}

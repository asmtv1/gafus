"use client";

import { createWebLogger } from "@gafus/logger";
import { initializeOfflineStore } from "@shared/stores/offlineStore";
import { useEffect } from "react";

// Создаем логгер для offline-store-initializer
const logger = createWebLogger("web-offline-store-initializer");

export default function OfflineStoreInitializer() {
  useEffect(() => {
    // Инициализируем offline store только после монтирования компонента
    try {
      initializeOfflineStore();
    } catch (error) {
      logger.warn("Failed to initialize offline store:", { error, operation: "warn" });
    }
  }, []);

  // Этот компонент не рендерит ничего
  return null;
}

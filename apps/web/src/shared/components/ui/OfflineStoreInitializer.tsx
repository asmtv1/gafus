"use client";

import { useEffect } from "react";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";

import { initializeOfflineStore } from "@shared/stores/offlineStore";

// Создаем логгер для offline-store-initializer
const logger = createWebLogger("web-offline-store-initializer");

export default function OfflineStoreInitializer() {
  useEffect(() => {
    // Инициализируем offline store только после монтирования компонента
    try {
      initializeOfflineStore();
    } catch (error) {
      reportClientError(error, {
        issueKey: "OfflineStoreInitializer",
        keys: { operation: "initialize_offline_store" },
      });
      logger.warn("Failed to initialize offline store:", { error, operation: "warn" });
    }
  }, []);

  // Этот компонент не рендерит ничего
  return null;
}

"use client";

import { initializeOfflineStore } from "@shared/stores/offlineStore";
import { useEffect } from "react";

export default function OfflineStoreInitializer() {
  useEffect(() => {
    // Инициализируем offline store только после монтирования компонента
    try {
      initializeOfflineStore();
    } catch (error) {
      console.warn("Failed to initialize offline store:", error);
    }
  }, []);

  // Этот компонент не рендерит ничего
  return null;
}

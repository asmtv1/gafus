"use client";

import { useEffect } from "react";

import { reportClientError } from "@gafus/error-handling";
import { createWebLogger } from "@gafus/logger";

import { setupFetchInterceptor } from "@shared/lib/network/fetchInterceptor";
import {
  cleanupOfflineDetector,
  initializeOfflineDetector,
} from "@shared/lib/network/offlineDetector";

const logger = createWebLogger("web-offline-detector-component");

/**
 * Компонент для инициализации глобального детектора офлайна
 * Автоматически редиректит на страницу офлайна при любых отсутствиях сети
 */
export default function OfflineDetector() {
  useEffect(() => {
    // Инициализируем детектор при монтировании
    try {
      initializeOfflineDetector();
      setupFetchInterceptor();
    } catch (error) {
      reportClientError(error, {
        issueKey: "OfflineDetector",
        keys: { operation: "initialize_offline_detector" },
      });
      logger.warn("Failed to initialize offline detector", {
        operation: "detector_init_error",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Очищаем при размонтировании
    return () => {
      try {
        cleanupOfflineDetector();
      } catch (error) {
        reportClientError(error, {
          issueKey: "OfflineDetector",
          keys: { operation: "cleanup_offline_detector" },
        });
        logger.warn("Failed to cleanup offline detector", {
          operation: "detector_cleanup_error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
  }, []);

  // Компонент не рендерит ничего
  return null;
}

import { useCallback, useEffect } from "react";
import { createWebLogger } from "@gafus/logger";
import { addPassiveEventListener, removePassiveEventListener } from "../utils/eventListeners";

// Создаем логгер для usePreloadComponents
const logger = createWebLogger("web-preload-components");

// Типы для предзагрузки
export interface PreloadConfig {
  component: () => Promise<unknown>;
  priority: "high" | "medium" | "low";
  condition?: () => boolean;
}

// Хук для предзагрузки компонентов
export function usePreloadComponents(configs: PreloadConfig[]) {
  const preloadComponent = useCallback(async (config: PreloadConfig) => {
    try {
      // Проверяем условие предзагрузки
      if (config.condition && !config.condition()) {
        return;
      }

      // Предзагружаем компонент
      await config.component();

      if (process.env.NODE_ENV === "development") {
        logger.warn(`✅ Preloaded component with ${config.priority} priority`, {
          operation: "warn",
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        logger.warn(`⚠️ Failed to preload component:`, { error, operation: "warn" });
      }
    }
  }, []);

  useEffect(() => {
    // Сортируем по приоритету
    const sortedConfigs = configs.toSorted((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Предзагружаем компоненты с задержкой
    sortedConfigs.forEach((config, index) => {
      const delay = index * 100; // 100ms между предзагрузками

      setTimeout(() => {
        preloadComponent(config);
      }, delay);
    });
  }, [configs, preloadComponent]);

  return { preloadComponent };
}

// Хук для предзагрузки на основе взаимодействия пользователя
export function useInteractionPreload() {
  const preloadComponent = useCallback(async (config: PreloadConfig) => {
    try {
      await config.component();

      if (process.env.NODE_ENV === "development") {
        logger.warn(`✅ Preloaded component on interaction`, { operation: "warn" });
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        logger.warn(`⚠️ Failed to preload component:`, { error, operation: "warn" });
      }
    }
  }, []);

  const preloadOnInteraction = useCallback(
    (config: PreloadConfig) => {
      const handleInteraction = () => {
        preloadComponent(config);
        // Удаляем обработчики после первого взаимодействия
        removePassiveEventListener(document, "mousemove", handleInteraction);
        removePassiveEventListener(document, "scroll", handleInteraction);
        removePassiveEventListener(document, "click", handleInteraction);
      };

      // Добавляем обработчики событий с пассивными слушателями для лучшей производительности
      addPassiveEventListener(document, "mousemove", handleInteraction, { once: true });
      addPassiveEventListener(document, "scroll", handleInteraction, { once: true });
      addPassiveEventListener(document, "click", handleInteraction, { once: true });
    },
    [preloadComponent],
  );

  return { preloadOnInteraction };
}

// Хук для предзагрузки на основе видимости
export function useVisibilityPreload() {
  const preloadComponent = useCallback(async (config: PreloadConfig) => {
    try {
      await config.component();

      if (process.env.NODE_ENV === "development") {
        logger.warn(`✅ Preloaded component on visibility`, { operation: "warn" });
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        logger.warn(`⚠️ Failed to preload component:`, { error, operation: "warn" });
      }
    }
  }, []);

  const preloadOnVisible = useCallback(
    (config: PreloadConfig, element: HTMLElement | null) => {
      if (!element) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              preloadComponent(config);
              observer.disconnect();
            }
          });
        },
        { threshold: 0.1 },
      );

      observer.observe(element);
    },
    [preloadComponent],
  );

  return { preloadOnVisible };
}

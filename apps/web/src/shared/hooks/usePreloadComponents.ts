import { useCallback, useEffect } from "react";

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
        console.warn(`✅ Preloaded component with ${config.priority} priority`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ Failed to preload component:`, error);
      }
    }
  }, []);

  useEffect(() => {
    // Сортируем по приоритету
    const sortedConfigs = [...configs].sort((a, b) => {
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
        console.warn(`✅ Preloaded component on interaction`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ Failed to preload component:`, error);
      }
    }
  }, []);

  const preloadOnInteraction = useCallback(
    (config: PreloadConfig) => {
      const handleInteraction = () => {
        preloadComponent(config);
        // Удаляем обработчики после первого взаимодействия
        document.removeEventListener("mousemove", handleInteraction);
        document.removeEventListener("scroll", handleInteraction);
        document.removeEventListener("click", handleInteraction);
      };

      // Добавляем обработчики событий
      document.addEventListener("mousemove", handleInteraction, { once: true });
      document.addEventListener("scroll", handleInteraction, { once: true });
      document.addEventListener("click", handleInteraction, { once: true });
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
        console.warn(`✅ Preloaded component on visibility`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ Failed to preload component:`, error);
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

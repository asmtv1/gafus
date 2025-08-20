// Основные экспорты SWR
export { default as useSWR } from "swr";
export { useSWRConfig } from "swr/_internal";
export { default as useSWRInfinite } from "swr/infinite";

// Типы
export type { SWRConfiguration, SWRResponse } from "swr";

// Оптимизированная конфигурация по умолчанию
export const defaultSWRConfig = {
  // Кэширование
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateOnMount: true,

  // Дедупликация запросов
  dedupingInterval: 2000,

  // Повторные попытки
  errorRetryCount: 3,
  errorRetryInterval: 5000,

  // Кэш
  keepPreviousData: true,

  // Оптимизация для мобильных устройств
  focusThrottleInterval: 5000,

  // Стратегии кэширования
  compare: (a: unknown, b: unknown) => a === b,

  // Настройки для разных типов данных
  suspense: false,

  // Оптимизация для списков
  fallback: {},

  // Настройки для больших данных
  onError: (error: Error) => {
    console.error("SWR Error:", error);
  },

  // Оптимизация для поиска
  onSuccess: (data: unknown, key: string) => {
    // Логирование успешных запросов в development
    if (process.env.NODE_ENV === "development") {
      console.warn(`✅ SWR Success: ${key}`);
    }
  },
};

import { useCallback, useState } from "react";

// Хуки для работы с Server Actions
export { useOptimistic } from "react";

// Утилиты для кэширования
export const createCacheKey = (...parts: (string | number | boolean | null | undefined)[]) => {
  return parts.filter((part): part is string | number | boolean => part != null).join(":");
};

// Хук для работы с Server Actions (упрощенная версия)
export const useServerAction = <T>(
  action: (...args: unknown[]) => Promise<T>,
  options?: {
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  },
) => {
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(
    async (...args: unknown[]) => {
      setIsPending(true);
      try {
        const result = await action(...args);
        options?.onSuccess?.(result);
      } catch (error) {
        options?.onError?.(error as Error);
      } finally {
        setIsPending(false);
      }
    },
    [action, options],
  );

  return { execute, isPending };
};

// Хук для оптимистичных обновлений
export const useOptimisticUpdate = <T>(
  mutate: (key: string, data?: T, options?: unknown) => void,
  cacheKey: string,
) => {
  const optimisticUpdate = useCallback(
    (newData: T, rollbackData?: T) => {
      // Оптимистично обновляем UI
      mutate(cacheKey, newData, false);

      // Возвращаем функцию для отката
      return () => {
        if (rollbackData !== undefined) {
          mutate(cacheKey, rollbackData, false);
        }
      };
    },
    [mutate, cacheKey],
  );

  return { optimisticUpdate };
};

// Экспорты из хуков
export { useData, useInfiniteData, useMutate, useSearchData } from "./hooks/useData";
export {
  useCoursesData,
  useOptimizedData,
  useSearchData as useOptimizedSearchData,
  useRealTimeData,
  useStatisticsData,
  useUserProfileData,
} from "./hooks/useOptimizedData";
export { SWRProvider } from "./providers/SWRProvider";

// Основные экспорты TanStack Query
import { useQueryClient, useMutation } from "@tanstack/react-query";
export { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
export { QueryClient, QueryClientProvider } from "@tanstack/react-query";
export { ReactQueryDevtools } from "@tanstack/react-query-devtools";

// Типы
export type {
  UseQueryOptions,
  UseMutationOptions,
  QueryKey,
  QueryFunction,
  MutationFunction,
} from "@tanstack/react-query";

// Оптимизированная конфигурация по умолчанию
export const defaultQueryConfig = {
  // Кэширование
  staleTime: 5 * 60 * 1000, // 5 минут
  gcTime: 10 * 60 * 1000, // 10 минут (ранее cacheTime)
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchOnMount: true,

  // Повторные попытки
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),

  // Оптимизация для мобильных устройств
  refetchInterval: false,
  refetchIntervalInBackground: false,

  // Настройки для больших данных - используем offlineFirst для лучшей работы в нестабильной сети
  networkMode: "offlineFirst" as const,
};

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
  const { mutate, isPending } = useMutation({
    mutationFn: action,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });

  return { execute: mutate, isPending };
};

// Хук для оптимистичных обновлений


// Экспорты из хуков
export {
  useData,
  useInfiniteData,
  useMutate,
  useSearchData,
  useDataMutation,
} from "./hooks/useData";

export {
  useCoursesData,
  useOptimizedData,
  useSearchData as useOptimizedSearchData,
  useRealTimeData,
  useStatisticsData,
  useUserProfileData,
} from "./hooks/useOptimizedData";

export { QueryProvider } from "./providers/QueryProvider";
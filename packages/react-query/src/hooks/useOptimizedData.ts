import { useMemo } from "react";
import { useData } from "./useData";

import type { UseQueryOptions } from "@tanstack/react-query";

// Типы данных для оптимизации
interface CourseData {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface UserProfileData {
  id: string;
  fullName: string;
  [key: string]: unknown;
}

interface StatisticsData {
  courses: unknown[];
  totalCourses: number;
  [key: string]: unknown;
}

type QueryCacheStrategy = "courses" | "user-profile" | "statistics" | "search" | "real-time";

// Конфигурации для разных типов данных
const cacheConfigs: Record<QueryCacheStrategy, any> = {
  courses: {
    staleTime: 30 * 1000, // 30 секунд для курсов
    gcTime: 5 * 60 * 1000, // 5 минут
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  },

  "user-profile": {
    staleTime: 60 * 1000, // 1 минута для профиля
    gcTime: 10 * 60 * 1000, // 10 минут
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  },

  statistics: {
    staleTime: 5 * 60 * 1000, // 5 минут для статистики
    gcTime: 15 * 60 * 1000, // 15 минут
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 3,
  },

  search: {
    staleTime: 1000, // 1 секунда для поиска
    gcTime: 2 * 60 * 1000, // 2 минуты
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  },

  "real-time": {
    staleTime: 5 * 1000, // 5 секунд для real-time данных
    gcTime: 30 * 1000, // 30 секунд
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 5,
  },
};

// Хук для курсов с оптимизированным кэшированием
export function useCoursesData<T extends CourseData>(
  key: string | null,
  fetcher?: () => Promise<T>,
) {
  const config = useMemo(() => cacheConfigs.courses, []);

  const result = useData<T>(key, fetcher, {
    ...config,
  });

  // Логирование в development режиме
  if (process.env.NODE_ENV === "development" && result.data) {
    console.warn(`📚 Courses loaded: ${key}`);
  }

  return result;
}

// Хук для профиля пользователя
export function useUserProfileData<T extends UserProfileData>(
  key: string | null,
  fetcher?: () => Promise<T>,
) {
  const config = useMemo(() => cacheConfigs["user-profile"], []);

  const result = useData<T>(key, fetcher, {
    ...config,
  });

  // Логирование в development режиме
  if (process.env.NODE_ENV === "development" && result.data) {
    console.warn(`👤 User profile loaded: ${key}`);
  }

  return result;
}

// Хук для статистики
export function useStatisticsData<T extends StatisticsData>(
  key: string | null,
  fetcher?: () => Promise<T>,
) {
  const config = useMemo(() => cacheConfigs.statistics, []);

  const result = useData<T>(key, fetcher, {
    ...config,
  });

  // Логирование в development режиме
  if (process.env.NODE_ENV === "development" && result.data) {
    console.warn(`📊 Statistics loaded: ${key}`);
  }

  return result;
}

// Хук для поиска
export function useSearchData<T>(
  key: string | null,
  fetcher?: () => Promise<T>,
) {
  const config = useMemo(() => cacheConfigs.search, []);

  const result = useData<T>(key, fetcher, {
    ...config,
  });

  // Логирование в development режиме
  if (process.env.NODE_ENV === "development" && result.data) {
    console.warn(`🔍 Search data loaded: ${key}`);
  }

  return result;
}

// Хук для real-time данных
export function useRealTimeData<T>(
  key: string | null,
  fetcher?: () => Promise<T>,
) {
  const config = useMemo(() => cacheConfigs["real-time"], []);

  const result = useData<T>(key, fetcher, {
    ...config,
  });

  // Логирование в development режиме
  if (process.env.NODE_ENV === "development" && result.data) {
    console.warn(`⚡ Real-time data loaded: ${key}`);
  }

  return result;
}

// Универсальный хук для любых данных с автоматическим выбором стратегии
export function useOptimizedData<T>(
  key: string | null,
  fetcher?: () => Promise<T>,
  strategy: QueryCacheStrategy = "courses",
) {
  const config = useMemo(() => cacheConfigs[strategy], [strategy]);

  const result = useData<T>(key, fetcher, {
    ...config,
  });

  // Логирование в development режиме
  if (process.env.NODE_ENV === "development" && result.data) {
    console.warn(`📦 Data loaded with ${strategy} strategy: ${key}`);
  }

  return result;
}
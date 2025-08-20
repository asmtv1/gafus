import { useMemo } from "react";
import type { SWRConfiguration } from "swr";
import useSWR from "swr";

// Локальные типы для данных
interface CourseData {
  id: string;
  name: string;
  description: string;
  duration: number;
}

interface UserProfileData {
  id: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
}

interface SWRStatisticsData {
  id: string;
  value: number;
  label: string;
}

type SWRCacheStrategy = "courses" | "user-profile" | "statistics" | "search" | "real-time";

// Конфигурации для разных типов данных
const cacheConfigs: Record<SWRCacheStrategy, SWRConfiguration> = {
  courses: {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 30000, // 30 секунд для курсов
    errorRetryCount: 2,
    keepPreviousData: true,
    compare: <T extends CourseData>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b),
  },

  "user-profile": {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 60000, // 1 минута для профиля
    errorRetryCount: 1,
    keepPreviousData: false, // Профиль должен быть актуальным
  },

  statistics: {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300000, // 5 минут для статистики
    errorRetryCount: 3,
    keepPreviousData: true,
  },

  search: {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 1000, // 1 секунда для поиска
    errorRetryCount: 1,
    keepPreviousData: true,
  },

  "real-time": {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5000, // 5 секунд для real-time данных
    errorRetryCount: 5,
    keepPreviousData: false,
  },
};

// Хук для курсов с оптимизированным кэшированием
export function useCoursesData<T extends CourseData>(key: string | null) {
  const config = useMemo(() => cacheConfigs.courses, []);

  return useSWR<T>(key, {
    ...config,
    onSuccess: (data: T, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`📚 Courses loaded: ${key}`);
      }
    },
  });
}

// Хук для профиля пользователя
export function useUserProfileData<T extends UserProfileData>(key: string | null) {
  const config = useMemo(() => cacheConfigs["user-profile"], []);

  return useSWR<T>(key, {
    ...config,
    onSuccess: (data: T, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`👤 Profile loaded: ${key}`);
      }
    },
  });
}

// Хук для статистики
export function useStatisticsData<T extends SWRStatisticsData>(key: string | null) {
  const config = useMemo(() => cacheConfigs.statistics, []);

  return useSWR<T>(key, {
    ...config,
    onSuccess: (data: T, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`📊 Statistics loaded: ${key}`);
      }
    },
  });
}

// Хук для поиска с быстрым кэшированием
export function useSearchData<T>(key: string | null) {
  const config = useMemo(() => cacheConfigs.search, []);

  return useSWR<T>(key, {
    ...config,
    onSuccess: (data: T, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`🔍 Search results loaded: ${key}`);
      }
    },
  });
}

// Хук для real-time данных
export function useRealTimeData<T>(key: string | null) {
  const config = useMemo(() => cacheConfigs["real-time"], []);

  return useSWR<T>(key, {
    ...config,
    onSuccess: (data: T, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚡ Real-time data loaded: ${key}`);
      }
    },
  });
}

// Универсальный хук для любых данных с автоматическим выбором стратегии
export function useOptimizedData<T>(key: string | null, strategy: SWRCacheStrategy = "courses") {
  const config = useMemo(() => cacheConfigs[strategy], [strategy]);

  return useSWR<T>(key, {
    ...config,
    onSuccess: (data: T, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`📦 Data loaded with ${strategy} strategy: ${key}`);
      }
    },
  });
}

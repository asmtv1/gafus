"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

import type { ReactNode } from "react";

interface QueryProviderProps {
  children: ReactNode;
  client?: QueryClient;
}

export function QueryProvider({ children, client }: QueryProviderProps) {
  // Создаем QueryClient только один раз на клиенте
  const [queryClient] = useState(
    () =>
      client ||
      new QueryClient({
        defaultOptions: {
          queries: {
            // Кэширование
            staleTime: 5 * 60 * 1000, // 5 минут
            gcTime: 10 * 60 * 1000, // 10 минут (ранее cacheTime)
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            refetchOnMount: true,

            // Повторные попытки с более агрессивными таймаутами
            retry: (failureCount, error) => {
              // Не повторяем при сетевых ошибках или таймаутах
              if (error instanceof Error && (
                error.message.includes('timeout') || 
                error.message.includes('network') ||
                error.message.includes('fetch')
              )) {
                return failureCount < 1; // Только одна попытка для сетевых ошибок
              }
              return failureCount < 2; // Максимум 2 попытки для других ошибок
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Максимум 5 секунд

            // Оптимизация для мобильных устройств
            refetchInterval: false,
            refetchIntervalInBackground: false,

            // Настройки для больших данных - используем offlineFirst для лучшей работы в нестабильной сети
            networkMode: "offlineFirst",
          },
          mutations: {
            retry: 1,
            networkMode: "online",
          },
        },
      }),
  );

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: "gafus-react-query-cache",
      throttleTime: 2000,
    }),
  );

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </PersistQueryClientProvider>
  );
}

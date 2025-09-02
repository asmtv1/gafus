"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

            // Повторные попытки
            retry: 3,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

            // Оптимизация для мобильных устройств
            refetchInterval: false,
            refetchIntervalInBackground: false,

            // Настройки для больших данных
            networkMode: "online",
          },
          mutations: {
            retry: 1,
            networkMode: "online",
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

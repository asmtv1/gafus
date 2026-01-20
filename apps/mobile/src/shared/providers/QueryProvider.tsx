import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Провайдер для React Query
 * Настраивает клиент с дефолтными опциями для mobile
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Время жизни кэша — 5 минут
            staleTime: 5 * 60 * 1000,
            // Не рефетчить при фокусе окна (нет смысла в mobile)
            refetchOnWindowFocus: false,
            // Повторять запросы при ошибке
            retry: 2,
            // Задержка между повторами
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
          mutations: {
            // Не повторять мутации автоматически
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

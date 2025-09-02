import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import type { UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";

// Хук для получения данных (замена useSWR)
export function useData<T>(
  key: string | null,
  fetcher?: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<T, Error>({
    queryKey: key ? [key] : [],
    queryFn: fetcher || (() => Promise.reject(new Error("No fetcher provided"))),
    enabled: !!key && !!fetcher,
    ...options,
  });
}

// Хук для мутации данных (замена useMutate)
export function useMutate() {
  const queryClient = useQueryClient();

  const mutate = useCallback(
    (key: string, data?: unknown, options?: { revalidate?: boolean }) => {
      if (data !== undefined) {
        // Устанавливаем данные в кэш
        queryClient.setQueryData([key], data);
      } else if (options?.revalidate !== false) {
        // Инвалидируем запрос
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    [queryClient],
  );

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  const clearCache = useCallback(() => {
    queryClient.clear();
  }, [queryClient]);

  return {
    mutate,
    invalidateAll,
    clearCache,
  };
}

// Хук для бесконечных данных (замена useSWRInfinite)
export function useInfiniteData<T>(
  key: string | null,
  fetcher: (pageParam: unknown) => Promise<{ data: T[]; nextCursor?: unknown }>,
  options?: Omit<UseQueryOptions<{ data: T[]; nextCursor?: unknown }>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: key ? [key] : [],
    queryFn: () => fetcher(null),
    enabled: !!key,
    ...options,
  });
}

// Хук для поиска с дебаунсом
export function useSearchData<T>(
  key: string | null,
  fetcher: (searchTerm: string) => Promise<T>,
  searchTerm: string,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: key ? [key, searchTerm] : [],
    queryFn: () => fetcher(searchTerm),
    enabled: !!key && !!searchTerm,
    staleTime: 1000, // 1 секунда для поиска
    ...options,
  });
}

// Хук для мутаций
export function useDataMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, Error, TVariables>,
) {
  return useMutation({
    mutationFn,
    ...options,
  });
}
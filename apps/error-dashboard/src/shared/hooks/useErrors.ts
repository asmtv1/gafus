"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useData } from "@gafus/react-query";
import { getErrorsCached } from "@shared/lib/actions/cachedErrors";

import type { ErrorDashboardReport } from "@gafus/types";

export function useErrors(filters?: {
  appName?: string;
  environment?: string;
  type?: "errors" | "logs" | "all";
  limit?: number;
  offset?: number;
  tags?: string[];
}) {
  const queryClient = useQueryClient();
  const cacheKey = `errors:${JSON.stringify(filters || {})}`;
  
  console.warn('[useErrors] Hook called with filters:', JSON.stringify(filters));
  console.warn('[useErrors] Cache key:', cacheKey);

  // Очистка кэша при монтировании для принудительной загрузки данных
  useEffect(() => {
    const cachedData = queryClient.getQueryData([cacheKey]);
    console.warn('[useErrors] Cache state on mount:', {
      hasCachedData: !!cachedData,
      cacheKey,
      cachedDataLength: Array.isArray(cachedData) ? cachedData.length : undefined,
    });
    
    // Удаляем старые данные из кэша для принудительной загрузки
    queryClient.removeQueries({ queryKey: [cacheKey] });
    console.warn('[useErrors] Cache cleared for:', cacheKey);
  }, [queryClient, cacheKey]);

  const result = useData<ErrorDashboardReport[]>(
    cacheKey,
    async () => {
      console.warn('[useErrors] Fetcher function called');
      const result = await getErrorsCached(filters);
      console.warn('[useErrors] getErrorsCached returned:', {
        success: result.success,
        errorCount: result.errors?.length || 0,
        error: result.error,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      return Array.isArray(result.errors) ? result.errors : [];
    },
    {
      refetchOnWindowFocus: false,
       refetchOnMount: false,
      // TODO: Временно отключено для диагностики — вернуть значения по умолчанию после проверки
      staleTime: 0,
    },
  );
  
  console.warn('[useErrors] Result:', {
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    hasError: !!result.error,
    errorMessage: result.error?.message,
    errorsCount: result.data?.length || 0,
    dataUpdatedAt: result.dataUpdatedAt,
    isStale: result.isStale,
  });
  
  return result;
}

export function useErrorsMutation() {
  const queryClient = useQueryClient();

  const invalidateErrors = (filters?: {
    appName?: string;
    environment?: string;
    type?: "errors" | "logs" | "all";
    limit?: number;
    offset?: number;
    tags?: string[];
  }) => {
    // Если передан конкретный фильтр, инвалидируем только его
    if (filters) {
      const cacheKey = `errors:${JSON.stringify(filters)}`;
      return queryClient.invalidateQueries({ queryKey: [cacheKey] });
    } else {
      // Если фильтры не переданы, инвалидируем все ключи, начинающиеся с "errors:"
      return queryClient.invalidateQueries({
        predicate: (query) => {
          const firstKey = query.queryKey[0];
          return typeof firstKey === "string" && firstKey.startsWith("errors:");
        },
      });
    }
  };

  return {
    invalidateErrors,
  };
}

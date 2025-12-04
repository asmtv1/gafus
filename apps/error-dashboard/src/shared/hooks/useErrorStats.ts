"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useData } from "@gafus/react-query";
import { getErrorStatsCached } from "@shared/lib/actions/cachedErrors";

export function useErrorStats() {
  const queryClient = useQueryClient();
  const cacheKey = "error-stats";
  
  console.warn('[useErrorStats] Hook called');
  
  // Очистка кэша при монтировании для принудительной загрузки данных
  useEffect(() => {
    const cachedData = queryClient.getQueryData([cacheKey]);
    console.warn('[useErrorStats] Cache state on mount:', {
      hasCachedData: !!cachedData,
      cacheKey,
    });
    
    // Удаляем старые данные из кэша для принудительной загрузки
    queryClient.removeQueries({ queryKey: [cacheKey] });
    console.warn('[useErrorStats] Cache cleared for:', cacheKey);
  }, [queryClient, cacheKey]);
  
  const result = useData(cacheKey, async () => {
    console.warn('[useErrorStats] Fetcher function called');
    const data = await getErrorStatsCached();
    console.warn('[useErrorStats] getErrorStatsCached returned:', {
      success: data.success,
      hasStats: !!data.stats,
      total: data.stats?.total,
      unresolved: data.stats?.unresolved,
      error: data.error,
      fullData: JSON.stringify(data),
    });
    return data;
  }, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: false,
    // TODO: Временно отключено для диагностики — вернуть значения по умолчанию после проверки
    staleTime: 0,
  });
  
  // Детальное логирование результата и проверки доступности
  const isDataValid = result.data 
    && result.data.success === true 
    && result.data.stats 
    && typeof result.data.stats === 'object'
    && typeof result.data.stats.total === 'number';
  
  console.warn('[useErrorStats] Result:', {
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    hasError: !!result.error,
    errorMessage: result.error?.message,
    hasData: !!result.data,
    dataSuccess: result.data?.success,
    dataUpdatedAt: result.dataUpdatedAt,
    isStale: result.isStale,
    fullData: result.data ? JSON.stringify(result.data) : 'null',
  });
  
  console.warn('[useErrorStats] Data validation:', {
    hasData: !!result.data,
    dataSuccess: result.data?.success,
    hasStatsObject: !!result.data?.stats,
    statsObjectType: typeof result.data?.stats,
    hasTotalField: result.data?.stats && 'total' in result.data.stats,
    totalType: typeof result.data?.stats?.total,
    totalValue: result.data?.stats?.total,
    isDataValid,
  });
  
  return result;
}

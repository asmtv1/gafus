"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getErrorsCached } from "@shared/lib/actions/cachedErrors";

import type { ErrorDashboardReport } from "@gafus/types";

export function useErrors(filters?: {
  appName?: string;
  environment?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}) {
  const cacheKey = `errors:${JSON.stringify(filters || {})}`;

  return useData<ErrorDashboardReport[]>(
    cacheKey,
    async () => {
      const result = await getErrorsCached(filters);
      if (!result.success) {
        throw new Error(result.error);
      }
      return Array.isArray(result.errors) ? result.errors : [];
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 секунд
    },
  );
}

export function useErrorsMutation() {
  const { mutate } = useMutate();

  const invalidateErrors = (filters?: {
    appName?: string;
    environment?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const cacheKey = `errors:${JSON.stringify(filters || {})}`;
    mutate(cacheKey, undefined);
  };

  const invalidateAllErrors = () => {
    // Инвалидируем все возможные ключи ошибок
    mutate("errors:", undefined);
  };

  return {
    invalidateErrors,
    invalidateAllErrors,
  };
}

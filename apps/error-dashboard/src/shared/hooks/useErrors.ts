"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getErrorsCached } from "@shared/lib/actions/cachedErrors";
import { resolveErrorAction, unresolveErrorAction } from "@shared/lib/actions/resolveError";
import { deleteAllErrors } from "@shared/lib/actions/errors";

import type { ErrorDashboardReport } from "@gafus/types";

export function useErrors(filters?: {
  appName?: string;
  environment?: string;
  resolved?: boolean;
  type?: "errors" | "logs" | "all";
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
    type?: "errors" | "logs" | "all";
    limit?: number;
    offset?: number;
  }) => {
    const cacheKey = `errors:${JSON.stringify(filters || {})}`;
    mutate(cacheKey, undefined);
  };

  const resolveError = async (errorId: string) => {
    const result = await resolveErrorAction(errorId);
    if (result.success) {
      // Инвалидируем кэш после успешного разрешения
      invalidateErrors();
      return result;
    } else {
      throw new Error(typeof result.error === 'string' ? result.error : 'Неизвестная ошибка');
    }
  };

  const unresolveError = async (errorId: string) => {
    const result = await unresolveErrorAction(errorId);
    if (result.success) {
      // Инвалидируем кэш после успешного изменения статуса
      invalidateErrors();
      return result;
    } else {
      throw new Error(typeof result.error === 'string' ? result.error : 'Неизвестная ошибка');
    }
  };

  const deleteAll = async () => {
    const result = await deleteAllErrors();
    if (result.success) {
      // Инвалидируем кэш после успешного удаления
      invalidateErrors();
      return result;
    } else {
      throw new Error(typeof result.error === 'string' ? result.error : 'Неизвестная ошибка');
    }
  };

  return {
    invalidateErrors,
    resolveError,
    unresolveError,
    deleteAll,
  };
}

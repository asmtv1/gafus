"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getErrorFilters } from "@shared/lib/actions/errorFilters";

import type { ErrorFilters } from "@gafus/types";

export function useErrorFilters() {
  return useData<ErrorFilters>("error-filters", getErrorFilters, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 300000, // 5 минут
  });
}

export function useMutateErrorFilters() {
  const { mutate } = useMutate();

  const invalidateFilters = () => {
    mutate("error-filters");
  };

  return { invalidateFilters };
}

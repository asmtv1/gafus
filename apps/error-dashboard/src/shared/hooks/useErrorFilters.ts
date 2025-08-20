"use client";

import { useData, useMutate } from "@gafus/swr";
import { getErrorFilters } from "@shared/lib/actions/errorFilters";

import type { ErrorFilters } from "@gafus/types";

export function useErrorFilters() {
  return useData<ErrorFilters>("error-filters", getErrorFilters, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300000, // 5 минут
  });
}

export function useMutateErrorFilters() {
  const { mutate } = useMutate();

  const invalidateFilters = () => {
    mutate("error-filters");
  };

  return { invalidateFilters };
}

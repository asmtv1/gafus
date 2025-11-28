"use client";

import { useData } from "@gafus/react-query";
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
  return {};
}

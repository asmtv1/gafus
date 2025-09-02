"use client";

import { useData } from "@gafus/react-query";
import { getErrorStats } from "@shared/lib/actions/errorStats";

export function useErrorStats() {
  return useData("error-stats", getErrorStats, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 300000, // 5 минут
  });
}

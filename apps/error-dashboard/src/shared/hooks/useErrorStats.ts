"use client";

import { useData } from "@gafus/swr";
import { getErrorStats } from "@shared/lib/actions/errorStats";

export function useErrorStats() {
  return useData("error-stats", getErrorStats, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 300000, // 5 минут
  });
}

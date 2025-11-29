"use client";

import { useData } from "@gafus/react-query";
import { getErrorStatsCached } from "@shared/lib/actions/cachedErrors";

export function useErrorStats() {
  return useData("error-stats", getErrorStatsCached, {
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 60000, // 1 минута (кэш Next.js уже 60 секунд)
  });
}

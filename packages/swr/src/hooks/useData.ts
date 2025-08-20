import { useCallback, useState } from "react";
import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";

import type { SWRConfiguration } from "swr";

// Хук для получения данных
export function useData<T>(
  key: string | null,
  fetcher?: () => Promise<T>,
  config?: SWRConfiguration,
) {
  return useSWR<T>(key, fetcher || null, config);
}

// Хук для мутации данных
export function useMutate() {
  const { mutate } = useSWRConfig();

  const mutateData = useCallback(
    async <T>(
      key: string,
      data?: T,
      options?: {
        revalidate?: boolean;
        populateCache?: boolean;
      },
    ) => {
      await mutate(key, data, options);
    },
    [mutate],
  );

  const mutateMultiple = useCallback(
    async <T>(
      keys: string[],
      data?: T,
      options?: {
        revalidate?: boolean;
        populateCache?: boolean;
      },
    ) => {
      await Promise.all(keys.map((key) => mutate(key, data, options)));
    },
    [mutate],
  );

  return { mutate: mutateData, mutateMultiple };
}

// Хук для бесконечной прокрутки
export function useInfiniteData<T>(
  key: string,
  fetcher: (pageIndex: number, previousPageData: T | null) => Promise<T>,
  config?: SWRConfiguration,
) {
  return useSWRInfinite(
    (pageIndex: number, previousPageData: T | null) => fetcher(pageIndex, previousPageData),
    config,
  );
}

// Хук для поиска с дебаунсом
export function useSearchData<T>(
  query: string,
  fetcher: (query: string) => Promise<T>,
  debounceMs = 300,
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return useSWR<T>(
    debouncedQuery ? `search:${debouncedQuery}` : null,
    () => fetcher(debouncedQuery),
    {
      revalidateOnFocus: false,
      dedupingInterval: 1000,
    },
  );
}

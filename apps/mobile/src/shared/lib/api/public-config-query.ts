import { useQuery } from "@tanstack/react-query";

import { fetchMobileAppPublicConfig } from "./public-config";

export function useMobileAppPublicConfig() {
  return useQuery({
    queryKey: ["mobile-public-config"],
    queryFn: fetchMobileAppPublicConfig,
    staleTime: 60_000,
    // Keep the native minimum version and subscription settings current.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

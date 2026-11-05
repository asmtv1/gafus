import { useQuery } from "@tanstack/react-query";

import { fetchMobileAppPublicConfig } from "./public-config";

export function useMobileAppPublicConfig() {
  return useQuery({
    queryKey: ["mobile-public-config"],
    queryFn: fetchMobileAppPublicConfig,
    staleTime: 60_000,
    // Catch admin's new mandatory OTA flag even while the app remains open.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

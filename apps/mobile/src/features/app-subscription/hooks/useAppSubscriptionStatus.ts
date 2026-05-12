import { useQuery } from "@tanstack/react-query";

import { appSubscriptionApi } from "../api/appSubscriptionApi";

export function useAppSubscriptionStatus() {
  return useQuery({
    queryKey: ["app-subscription", "status"],
    queryFn: () => appSubscriptionApi.getStatus(),
    staleTime: 30_000,
  });
}

import { useMobileAppPublicConfig } from "@/shared/lib/api/public-config-query";

import { usePaywallStore } from "../store/paywallStore";
import { useAppSubscriptionStatus } from "./useAppSubscriptionStatus";

export function useRequireAppSubscription() {
  const { data, refetch } = useAppSubscriptionStatus();
  const { data: publicConfigResponse } = useMobileAppPublicConfig();
  const requestOpenPaywall = usePaywallStore((s) => s.requestOpen);

  return async function requireSubscription() {
    const statusResponse = data ?? (await refetch()).data;
    const hasActive = Boolean(statusResponse?.data?.hasActiveSubscription);

    if (!hasActive) {
      const gatingEnabled = Boolean(publicConfigResponse?.data?.appSubscriptionGatingEnabled);
      if (!gatingEnabled) {
        return true;
      }
      const paywallEnabled = Boolean(publicConfigResponse?.data?.appSubscriptionPaywallEnabled);
      if (paywallEnabled) {
        requestOpenPaywall({ reason: "required" });
      }
      return false;
    }

    return true;
  };
}

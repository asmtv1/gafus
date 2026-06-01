import { useMobileAppPublicConfig } from "@/shared/lib/api/public-config-query";

import { usePaywallStore } from "../store/paywallStore";
import { useAppSubscriptionStatus } from "./useAppSubscriptionStatus";
import { getSubscriptionGateDecision } from "../lib/subscriptionGateDecision";

export function useRequireAppSubscription() {
  const { data, refetch } = useAppSubscriptionStatus();
  const { data: publicConfigResponse, refetch: refetchPublicConfig } = useMobileAppPublicConfig();
  const requestOpenPaywall = usePaywallStore((s) => s.requestOpen);

  return async function requireSubscription() {
    const statusResponse = data ?? (await refetch()).data;
    const hasActive = Boolean(statusResponse?.data?.hasActiveSubscription);
    if (hasActive) {
      return true;
    }

    const configResponse = publicConfigResponse ?? (await refetchPublicConfig()).data;
    const decision = getSubscriptionGateDecision({
      hasActiveSubscription: hasActive,
      configLoaded: Boolean(configResponse?.success && configResponse.data),
      gatingEnabled: Boolean(configResponse?.data?.appSubscriptionGatingEnabled),
      paywallEnabled: Boolean(configResponse?.data?.appSubscriptionPaywallEnabled),
    });

    if (decision.openPaywall) {
      requestOpenPaywall({ reason: "required" });
    }

    return decision.allow;
  };
}

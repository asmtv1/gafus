import { useEffect, type PropsWithChildren } from "react";

import { setSubscriptionRequiredHandler } from "@/shared/lib/api/subscriptionRequired";
import { AppSubscriptionPaywall } from "./AppSubscriptionPaywall";
import { requestAppSubscriptionPaywall, usePaywallStore } from "../store/paywallStore";

export function AppSubscriptionProvider({ children }: PropsWithChildren) {
  const isOpen = usePaywallStore((s) => s.isOpen);

  useEffect(
    () => setSubscriptionRequiredHandler(requestAppSubscriptionPaywall),
    [],
  );

  return (
    <>
      {children}
      {isOpen ? <AppSubscriptionPaywall /> : null}
    </>
  );
}

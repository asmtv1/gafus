import type { PropsWithChildren } from "react";

import { useMobileOnboardingTourStore } from "@/features/onboarding-tour/tour-store";
import { AppSubscriptionPaywall } from "./AppSubscriptionPaywall";
import { usePaywallStore } from "../store/paywallStore";

export function AppSubscriptionProvider({ children }: PropsWithChildren) {
  const isOpen = usePaywallStore((s) => s.isOpen);
  const canShowAfterTour = useMobileOnboardingTourStore(
    (s) => s.hasHydrated && s.hasSeenV1 && !s.isActive && !s.isAwaitingRequiredPetCreation,
  );

  return (
    <>
      {children}
      {isOpen && canShowAfterTour ? <AppSubscriptionPaywall /> : null}
    </>
  );
}

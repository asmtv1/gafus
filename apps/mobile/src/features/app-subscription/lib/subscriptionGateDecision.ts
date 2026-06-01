export type SubscriptionGateDecisionInput = {
  hasActiveSubscription: boolean;
  configLoaded: boolean;
  gatingEnabled?: boolean;
  paywallEnabled?: boolean;
};

export type SubscriptionGateDecision = {
  allow: boolean;
  openPaywall: boolean;
};

export function getSubscriptionGateDecision(
  input: SubscriptionGateDecisionInput,
): SubscriptionGateDecision {
  if (input.hasActiveSubscription) {
    return { allow: true, openPaywall: false };
  }

  if (!input.configLoaded) {
    return { allow: false, openPaywall: true };
  }

  if (!input.gatingEnabled) {
    return { allow: true, openPaywall: false };
  }

  if (!input.paywallEnabled) {
    return { allow: false, openPaywall: false };
  }

  return { allow: false, openPaywall: true };
}

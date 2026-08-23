export type SubscriptionRequiredReason = "required";
export type SubscriptionRequiredHandler = (reason: SubscriptionRequiredReason) => void;

let subscriptionRequiredHandler: SubscriptionRequiredHandler | null = null;

export function setSubscriptionRequiredHandler(
  handler: SubscriptionRequiredHandler | null,
): () => void {
  subscriptionRequiredHandler = handler;

  return () => {
    if (subscriptionRequiredHandler === handler) {
      subscriptionRequiredHandler = null;
    }
  };
}

export function notifySubscriptionRequired(reason: SubscriptionRequiredReason = "required"): void {
  subscriptionRequiredHandler?.(reason);
}

export function isSubscriptionRequiredCode(code?: string): boolean {
  return code === "SUBSCRIPTION_REQUIRED" || code === "SUBSCRIPTION_OR_CREDITS_REQUIRED";
}

export function shouldNotifySubscriptionRequired(input: {
  httpStatus: number;
  code?: string;
  suppressSubscriptionPaywall?: boolean;
}): boolean {
  if (input.suppressSubscriptionPaywall) return false;
  if (input.httpStatus !== 402) return false;
  return isSubscriptionRequiredCode(input.code);
}

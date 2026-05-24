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

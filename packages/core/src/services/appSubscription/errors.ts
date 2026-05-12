export class SubscriptionRequiredError extends Error {
  code = "SUBSCRIPTION_REQUIRED" as const;
  status = 402 as const;

  constructor(message = "Для действия нужна подписка") {
    super(message);
  }
}

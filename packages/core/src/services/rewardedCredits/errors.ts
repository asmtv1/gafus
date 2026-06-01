export class RewardedCreditsRequiredError extends Error {
  code = "REWARDED_INSUFFICIENT_CREDITS" as const;

  constructor(message = "Недостаточно rewarded credits") {
    super(message);
    this.name = "RewardedCreditsRequiredError";
  }
}

export class SubscriptionOrCreditsRequiredError extends Error {
  code = "SUBSCRIPTION_OR_CREDITS_REQUIRED" as const;

  constructor(message = "Требуется подписка или rewarded credits") {
    super(message);
    this.name = "SubscriptionOrCreditsRequiredError";
  }
}

export class RewardedAdsDisabledError extends Error {
  code = "REWARDED_ADS_DISABLED" as const;

  constructor(message = "Rewarded ads недоступны") {
    super(message);
    this.name = "RewardedAdsDisabledError";
  }
}

export class RewardedDailyLimitReachedError extends Error {
  code = "REWARDED_DAILY_LIMIT_REACHED" as const;

  constructor(message = "Дневной лимит rewarded ads исчерпан") {
    super(message);
    this.name = "RewardedDailyLimitReachedError";
  }
}

export class RewardedBalanceFullError extends Error {
  code = "REWARDED_BALANCE_FULL" as const;

  constructor(message = "Баланс rewarded credits уже полон") {
    super(message);
    this.name = "RewardedBalanceFullError";
  }
}

export class RewardedAdSessionError extends Error {
  constructor(
    public code:
      | "REWARDED_SESSION_NOT_FOUND"
      | "REWARDED_SESSION_EXPIRED"
      | "REWARDED_SESSION_ALREADY_GRANTED"
      | "REWARDED_SESSION_INVALID_NONCE",
    message: string,
  ) {
    super(message);
    this.name = "RewardedAdSessionError";
  }
}

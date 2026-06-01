import type { REWARDED_DAILY_LIMIT_VALUES } from "./constants";

export type RewardedPlatform = "ANDROID" | "IOS" | "WEB_DESKTOP" | "WEB_TOUCH";
export type RewardedProvider = "YANDEX";
export type RewardedTargetType =
  | "ARTICLE"
  | "COURSE_STEP"
  | "DAILY_COURSE_STEP"
  | "CONSULTATION_BOOKING";
export type RewardedCreditTransactionType = "EARN" | "SPEND" | "REFUND" | "ADJUSTMENT";
export type RewardedDailyLimit = (typeof REWARDED_DAILY_LIMIT_VALUES)[number];

export interface RewardedTargetInput {
  targetType: RewardedTargetType;
  targetId: string;
  cost?: number;
}

export interface RewardedAdSettingsDto {
  androidEnabled: boolean;
  iosEnabled: boolean;
  webDesktopEnabled: boolean;
  webTouchEnabled: boolean;
  paywallCtaEnabled: boolean;
  dailyAdLimit: RewardedDailyLimit;
  yandexAndroidPlacementId: string | null;
  yandexIosPlacementId: string | null;
  yandexWebDesktopBlockId: string | null;
  yandexWebTouchBlockId: string | null;
  testMode: boolean;
}

export interface RewardedPlatformSettingsDto {
  platform: RewardedPlatform;
  platformEnabled: boolean;
  paywallCtaEnabled: boolean;
  placementId: string;
  dailyAdLimit: RewardedDailyLimit;
  testMode: boolean;
}

export interface RewardedWalletDto {
  balance: number;
  pendingRefundCredits: number;
  maxBalance: number;
  creditsPerReward: number;
}

export interface RewardedCreditsStatusDto {
  wallet: RewardedWalletDto;
  today: {
    adsWatchedToday: number;
    dailyAdLimit: RewardedDailyLimit;
    limitResetAt: string;
  };
  settings: {
    platformEnabled: boolean;
    paywallCtaEnabled: boolean;
    testMode: boolean;
  };
  canWatchAd: boolean;
  canWatchAdReason:
    | "OK"
    | "PLATFORM_DISABLED"
    | "CTA_DISABLED"
    | "DAILY_LIMIT_REACHED"
    | "BALANCE_FULL";
  nextGrantCredits: number;
  target?: {
    targetType: RewardedTargetType;
    targetId: string;
    cost: number;
    unlocked: boolean;
    canUnlockWithCurrentBalance: boolean;
    missingCredits: number;
  };
}

export interface RewardedSpendResultDto {
  transactionId: string | null;
  spentCredits: number;
  balance: number;
  pendingRefundCredits: number;
  skippedDueToPremium: boolean;
  replay: boolean;
}

export interface RewardedRefundResultDto {
  transactionId: string | null;
  refundedCredits: number;
  balance: number;
  pendingRefundCredits: number;
  replay: boolean;
}

export interface RewardedGrantResultDto {
  transactionId: string | null;
  grantedCredits: number;
  balance: number;
  pendingRefundCredits: number;
  maxBalance: number;
  adsWatchedToday: number;
  dailyAdLimit: RewardedDailyLimit;
  canWatchAd: boolean;
  replay: boolean;
}

export interface RewardedAdSessionDto {
  sessionId: string;
  requestNonce: string;
  provider: RewardedProvider;
  placementId: string;
  platform: RewardedPlatform;
  expiresAt: string;
  testMode: boolean;
}

export type RewardedAdLifecycleEvent =
  | "LOADED"
  | "SHOWN"
  | "DISMISSED"
  | "FAILED"
  | "REWARDED";

export interface PremiumOrRewardedAccessDto {
  allowed: boolean;
  source: "GATING_DISABLED" | "PREMIUM" | "REWARDED";
  skippedDueToPremium: boolean;
  target: RewardedTargetInput;
}

export interface RewardedUnlockResultDto {
  targetType: RewardedTargetType;
  targetId: string;
  unlocked: true;
  spentCredits: number;
  balance: number;
  pendingRefundCredits: number;
}

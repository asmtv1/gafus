import { Platform } from "react-native";

import { apiClient, type ApiResponse } from "@/shared/lib/api/client";

export type RewardedPlatform = "ANDROID" | "IOS";
export type RewardedTargetType =
  | "ARTICLE"
  | "COURSE_STEP"
  | "DAILY_COURSE_STEP"
  | "CONSULTATION_BOOKING";

export type RewardedCreditsStatusDto = {
  wallet: {
    balance: number;
    pendingRefundCredits: number;
    maxBalance: number;
    creditsPerReward: number;
  };
  today: {
    adsWatchedToday: number;
    dailyAdLimit: 1 | 2 | 3;
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
};

export type RewardedAdSessionDto = {
  sessionId: string;
  requestNonce: string;
  provider: "YANDEX";
  placementId: string;
  platform: RewardedPlatform;
  expiresAt: string;
  testMode: boolean;
};

export type RewardedGrantResultDto = {
  transactionId: string | null;
  grantedCredits: number;
  balance: number;
  pendingRefundCredits: number;
  maxBalance: number;
  adsWatchedToday: number;
  dailyAdLimit: 1 | 2 | 3;
  canWatchAd: boolean;
  replay: boolean;
};

function getMobileRewardedPlatform(): RewardedPlatform {
  return Platform.OS === "ios" ? "IOS" : "ANDROID";
}

export const rewardedAdsApi = {
  getStatus(target?: {
    targetType: RewardedTargetType;
    targetId: string;
  }): Promise<ApiResponse<RewardedCreditsStatusDto>> {
    const params = new URLSearchParams({ platform: getMobileRewardedPlatform() });
    if (target) {
      params.set("targetType", target.targetType);
      params.set("targetId", target.targetId);
    }
    return apiClient(`/api/v1/rewarded-ads/status?${params}`);
  },

  createSession(target?: {
    targetType: RewardedTargetType;
    targetId: string;
  }): Promise<ApiResponse<RewardedAdSessionDto>> {
    return apiClient("/api/v1/rewarded-ads/session", {
      method: "POST",
      body: {
        platform: getMobileRewardedPlatform(),
        ...target,
      },
    });
  },

  recordEvent(body: {
    sessionId: string;
    eventType: "LOADED" | "SHOWN" | "DISMISSED" | "FAILED" | "REWARDED";
    payload?: unknown;
  }): Promise<ApiResponse<void>> {
    return apiClient("/api/v1/rewarded-ads/events", { method: "POST", body });
  },

  grant(body: {
    sessionId: string;
    requestNonce: string;
    providerPayload?: unknown;
  }): Promise<ApiResponse<RewardedGrantResultDto>> {
    return apiClient("/api/v1/rewarded-ads/grant", { method: "POST", body });
  },
};

import { Platform } from "react-native";

import { apiClient, type ApiResponse } from "@/shared/lib/api/client";

export type RewardedPlatform = "ANDROID" | "IOS";
export type RewardedTargetType = "ARTICLE" | "COURSE_STEP";

export type RewardedTarget = {
  targetType: RewardedTargetType;
  targetId: string;
};

export type RewardedAccessStatusDto = {
  settings: {
    platformEnabled: boolean;
    testMode: boolean;
  };
  canWatchAd: boolean;
  canWatchAdReason:
    | "OK"
    | "PLATFORM_DISABLED"
    | "TARGET_ALREADY_ACTIVE"
    | "DAILY_LIMIT_REACHED";
  target: RewardedTarget & {
    unlocked: boolean;
    expiresAt: string | null;
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
  accessId: string;
  targetType: RewardedTargetType;
  targetId: string;
  expiresAt: string;
  replay: boolean;
};

function getMobileRewardedPlatform(): RewardedPlatform {
  return Platform.OS === "ios" ? "IOS" : "ANDROID";
}

export const rewardedAdsApi = {
  getStatus(target: RewardedTarget): Promise<ApiResponse<RewardedAccessStatusDto>> {
    const params = new URLSearchParams({ platform: getMobileRewardedPlatform() });
    params.set("targetType", target.targetType);
    params.set("targetId", target.targetId);
    return apiClient(`/api/v1/rewarded-ads/status?${params}`);
  },

  createSession(target: RewardedTarget): Promise<ApiResponse<RewardedAdSessionDto>> {
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

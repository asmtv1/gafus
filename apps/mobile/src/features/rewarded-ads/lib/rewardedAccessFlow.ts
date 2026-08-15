import type { ApiResponse } from "@/shared/lib/api/client";
import { reportClientError } from "@/shared/lib/tracer";

import { showYandexRewardedAd } from "../adapter/yandexRewardedAds";
import {
  rewardedAdsApi,
  type RewardedGrantResultDto,
  type RewardedTarget,
} from "../api/rewardedAdsApi";

export type RewardedAccessFailure =
  | "NO_FILL"
  | "NETWORK"
  | "INTERNAL"
  | "INCOMPLETE"
  | "DAILY_LIMIT";

export type RewardedAccessFlowResult =
  | { success: true; data: RewardedGrantResultDto | null; alreadyActive?: boolean }
  | { success: false; failure: RewardedAccessFailure; message: string };

const USER_MESSAGES: Record<RewardedAccessFailure, string> = {
  NO_FILL: "Сейчас не можем подобрать для вас рекламу. Попробуйте позже",
  NETWORK: "Не удалось загрузить рекламу. Проверьте интернет и попробуйте ещё раз",
  INTERNAL: "Ошибка сервиса Гафус. Попробуйте ещё раз или обратитесь к администрации",
  INCOMPLETE: "Материал не открыт: просмотр рекламы не был завершён",
  DAILY_LIMIT:
    "Достигнут дневной лимит просмотра рекламы. Пожалуйста, возвращайтесь завтра.",
};

function errorDetails(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; description?: unknown };
    return {
      code: typeof value.code === "string" ? value.code : "",
      message:
        typeof value.description === "string"
          ? value.description
          : typeof value.message === "string"
            ? value.message
            : String(error),
    };
  }
  return { code: "", message: String(error ?? "") };
}

export function classifyRewardedAccessError(error: unknown): RewardedAccessFailure {
  const details = errorDetails(error);
  const normalized = `${details.code} ${details.message}`.toLowerCase();

  if (
    details.code === "REWARDED_DAILY_LIMIT_REACHED" ||
    normalized.includes("rewarded_daily_limit_reached")
  ) {
    return "DAILY_LIMIT";
  }

  if (
    normalized.includes("no_fill") ||
    normalized.includes("no fill") ||
    normalized.includes("nofill") ||
    normalized.includes("no ads") ||
    normalized.includes("inventory unavailable") ||
    normalized.includes("нет доступной рекламы") ||
    normalized.includes("нет подходящей рекламы") ||
    normalized.includes("не удалось подобрать рекламу")
  ) {
    return "NO_FILL";
  }

  if (
    normalized.includes("network_error") ||
    normalized.includes("request_timeout") ||
    normalized.includes("network") ||
    normalized.includes("internet") ||
    normalized.includes("offline") ||
    normalized.includes("не загрузилась") ||
    normalized.includes("не удалось загрузить") ||
    normalized.includes("нет подключения") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  ) {
    return "NETWORK";
  }

  return "INTERNAL";
}

export function getRewardedAccessErrorMessage(failure: RewardedAccessFailure): string {
  return USER_MESSAGES[failure];
}

function failed(error: unknown): RewardedAccessFlowResult {
  const failure = classifyRewardedAccessError(error);
  return { success: false, failure, message: USER_MESSAGES[failure] };
}

function apiFailure(response: ApiResponse<unknown>): RewardedAccessFlowResult {
  return failed({ code: response.code, message: response.error });
}

export async function openTargetWithRewardedAd(
  target: RewardedTarget,
): Promise<RewardedAccessFlowResult> {
  const sessionResponse = await rewardedAdsApi.createSession(target);
  if (!sessionResponse.success && sessionResponse.code === "TARGET_ALREADY_ACTIVE") {
    return { success: true, data: null, alreadyActive: true };
  }
  if (!sessionResponse.success || !sessionResponse.data) return apiFailure(sessionResponse);

  try {
    const grantResponse = await showYandexRewardedAd(sessionResponse.data);
    if (!grantResponse) {
      return { success: false, failure: "INCOMPLETE", message: USER_MESSAGES.INCOMPLETE };
    }
    if (!grantResponse.success || !grantResponse.data) return apiFailure(grantResponse);
    return { success: true, data: grantResponse.data };
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "RewardedAccessFlow",
      keys: {
        operation: "open_target_with_rewarded_ad",
        targetType: target.targetType,
        targetId: target.targetId,
      },
    });
    return failed(error);
  }
}

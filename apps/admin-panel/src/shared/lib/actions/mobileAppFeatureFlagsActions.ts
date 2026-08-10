"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import {
  MobileReleaseControlConflictError,
  updateMobileReleaseControl,
  type MobileReleaseControlDto,
} from "@gafus/core/services/appFeatureFlags";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("admin-mobile-release-control");
const semverSchema = z
  .string()
  .trim()
  .regex(/^\d+\.\d+\.\d+$/, "Версия должна быть в формате 1.6.4")
  .nullable();
const featureValuesSchema = z.object({
  vkLogin: z.boolean(),
  iosRuCardPayment: z.boolean(),
  iosRuCardPaymentHint: z.boolean(),
  rewardedAds: z.boolean(),
});
const releaseControlSchema = z.object({
  revision: z.number().int().positive(),
  iosReviewVersion: semverSchema,
  released: featureValuesSchema,
  review: featureValuesSchema,
  global: z.object({
    appSubscriptionPaywall: z.boolean(),
    appSubscriptionGating: z.boolean(),
  }),
  rewardedAds: z.object({
    androidEnabled: z.boolean(),
    yandexAndroidPlacementId: z.string().trim().max(256).nullable(),
    yandexIosPlacementId: z.string().trim().max(256).nullable(),
    testMode: z.boolean(),
  }),
});

export type UpdateMobileReleaseControlActionResult =
  | { success: true; data: MobileReleaseControlDto }
  | { success: false; error: string; code?: "STALE_CONFIG" | "VALIDATION_ERROR" };

export async function updateMobileReleaseControlAction(
  payload: unknown,
): Promise<UpdateMobileReleaseControlActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (session.user.role !== "ADMIN") {
      return { success: false, error: "Изменять релизные настройки может только ADMIN" };
    }

    const parsed = releaseControlSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Некорректные настройки",
        code: "VALIDATION_ERROR",
      };
    }

    const data = await updateMobileReleaseControl(parsed.data, session.user.id);
    logger.success("mobile release control updated", {
      actorId: session.user.id,
      revision: data.revision,
      iosReviewVersion: data.iosReviewVersion,
    });
    return { success: true, data };
  } catch (error) {
    if (error instanceof MobileReleaseControlConflictError) {
      return { success: false, error: error.message, code: "STALE_CONFIG" };
    }
    logger.error("updateMobileReleaseControlAction failed", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

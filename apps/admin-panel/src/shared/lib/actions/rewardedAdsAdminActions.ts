"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import {
  getRewardedAdSettings,
  updateRewardedAdSettings,
} from "@gafus/core/services/rewardedCredits";
import { getErrorMessage } from "@gafus/core/errors";

const settingsSchema = z.object({
  androidEnabled: z.boolean(),
  iosEnabled: z.boolean(),
  webDesktopEnabled: z.boolean(),
  webTouchEnabled: z.boolean(),
  paywallCtaEnabled: z.boolean(),
  dailyAdLimit: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  testMode: z.boolean(),
  yandexAndroidPlacementId: z.string().trim().max(256).nullable(),
  yandexIosPlacementId: z.string().trim().max(256).nullable(),
  yandexWebDesktopBlockId: z.string().trim().max(256).nullable(),
  yandexWebTouchBlockId: z.string().trim().max(256).nullable(),
});

export async function getRewardedAdSettingsAction() {
  return getRewardedAdSettings();
}

export async function updateRewardedAdSettingsAction(payload: unknown) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    if (session.user.role !== "ADMIN") {
      return { success: false, error: "Недостаточно прав" };
    }

    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: "Невалидные данные" };
    }

    await updateRewardedAdSettings(parsed.data, session.user.id);
    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import {
  getDefaultAppSubscriptionSettings,
  updateDefaultAppSubscriptionSettings,
} from "@gafus/core/services/appSubscription";
import { getErrorMessage } from "@gafus/core/errors";

const nullableProductId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(1).max(255).nullable(),
);

const settingsSchema = z.object({
  twoWeeksEnabled: z.boolean(),
  yookassaTwoWeeksPriceRub: z.coerce.number().min(1).max(100000),
  twoWeeksIntervalDays: z.coerce.number().int().min(1).max(366),
  monthlyEnabled: z.boolean(),
  yookassaMonthlyPriceRub: z.coerce.number().min(1).max(100000),
  monthlyIntervalDays: z.coerce.number().int().min(1).max(366),
  threeMonthsEnabled: z.boolean(),
  yookassaThreeMonthsPriceRub: z.coerce.number().min(1).max(100000),
  threeMonthsIntervalDays: z.coerce.number().int().min(1).max(366),
  monthlyAppleProductId: nullableProductId,
});

export async function getAppSubscriptionSettingsAction() {
  const settings = await getDefaultAppSubscriptionSettings();
  return {
    twoWeeksEnabled: settings?.twoWeeksEnabled ?? false,
    yookassaTwoWeeksPriceRub: Number(settings?.yookassaTwoWeeksPriceRub ?? 1185),
    twoWeeksIntervalDays: settings?.twoWeeksIntervalDays ?? 30,
    monthlyEnabled: settings?.monthlyEnabled ?? true,
    yookassaMonthlyPriceRub: Number(settings?.yookassaMonthlyPriceRub ?? 1465),
    monthlyIntervalDays: settings?.monthlyIntervalDays ?? 30,
    threeMonthsEnabled: settings?.threeMonthsEnabled ?? false,
    yookassaThreeMonthsPriceRub: Number(settings?.yookassaThreeMonthsPriceRub ?? 2470),
    threeMonthsIntervalDays: settings?.threeMonthsIntervalDays ?? 30,
    monthlyAppleProductId: settings?.monthlyAppleProductId ?? null,
  };
}

export async function updateAppSubscriptionSettingsAction(payload: unknown) {
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

    await updateDefaultAppSubscriptionSettings({
      twoWeeksEnabled: parsed.data.twoWeeksEnabled,
      yookassaTwoWeeksPriceRub: parsed.data.yookassaTwoWeeksPriceRub,
      twoWeeksIntervalDays: parsed.data.twoWeeksIntervalDays,
      monthlyEnabled: parsed.data.monthlyEnabled,
      yookassaMonthlyPriceRub: parsed.data.yookassaMonthlyPriceRub,
      monthlyIntervalDays: parsed.data.monthlyIntervalDays,
      threeMonthsEnabled: parsed.data.threeMonthsEnabled,
      yookassaThreeMonthsPriceRub: parsed.data.yookassaThreeMonthsPriceRub,
      threeMonthsIntervalDays: parsed.data.threeMonthsIntervalDays,
      monthlyAppleProductId: parsed.data.monthlyAppleProductId,
      actorId: session.user.id,
    });
    revalidatePath("/main-panel/admin");

    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

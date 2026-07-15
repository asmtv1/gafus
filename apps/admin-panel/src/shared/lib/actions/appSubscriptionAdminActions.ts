"use server";

import { z } from "zod";
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
  monthlyEnabled: z.boolean(),
  yookassaMonthlyPriceRub: z.coerce.number().min(1).max(100000),
  monthlyIntervalDays: z.coerce.number().int().min(1).max(366),
  monthlyAppleProductId: nullableProductId,
});

export async function getAppSubscriptionSettingsAction() {
  const settings = await getDefaultAppSubscriptionSettings();
  return {
    monthlyEnabled: settings?.monthlyEnabled ?? true,
    yookassaMonthlyPriceRub: Number(settings?.yookassaMonthlyPriceRub ?? 2500),
    monthlyIntervalDays: settings?.monthlyIntervalDays ?? 30,
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
      monthlyEnabled: parsed.data.monthlyEnabled,
      yookassaMonthlyPriceRub: parsed.data.yookassaMonthlyPriceRub,
      monthlyIntervalDays: parsed.data.monthlyIntervalDays,
      monthlyAppleProductId: parsed.data.monthlyAppleProductId,
      actorId: session.user.id,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

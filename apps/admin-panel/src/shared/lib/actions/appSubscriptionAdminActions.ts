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

const settingsSchema = z
  .object({
    weeklyEnabled: z.boolean(),
    monthlyEnabled: z.boolean(),
    yookassaWeeklyPriceRub: z.coerce.number().min(1).max(100000),
    yookassaMonthlyPriceRub: z.coerce.number().min(1).max(100000),
    weeklyIntervalDays: z.coerce.number().int().min(1).max(366),
    monthlyIntervalDays: z.coerce.number().int().min(1).max(366),
    weeklyAppleProductId: nullableProductId,
    monthlyAppleProductId: nullableProductId,
  })
  .refine(
    (value) =>
      !value.weeklyAppleProductId ||
      !value.monthlyAppleProductId ||
      value.weeklyAppleProductId !== value.monthlyAppleProductId,
    {
      message: "Apple Product ID должны отличаться",
      path: ["monthlyAppleProductId"],
    },
  );

export async function getAppSubscriptionSettingsAction() {
  const settings = await getDefaultAppSubscriptionSettings();
  return {
    weeklyEnabled: settings?.weeklyEnabled ?? true,
    monthlyEnabled: settings?.monthlyEnabled ?? true,
    yookassaWeeklyPriceRub: Number(settings?.yookassaWeeklyPriceRub ?? 200),
    yookassaMonthlyPriceRub: Number(settings?.yookassaMonthlyPriceRub ?? 1100),
    weeklyIntervalDays: settings?.weeklyIntervalDays ?? 7,
    monthlyIntervalDays: settings?.monthlyIntervalDays ?? 30,
    weeklyAppleProductId:
      settings?.weeklyAppleProductId ??
      (settings as { appleProductId?: string | null } | null)?.appleProductId ??
      null,
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
      weeklyEnabled: parsed.data.weeklyEnabled,
      monthlyEnabled: parsed.data.monthlyEnabled,
      yookassaWeeklyPriceRub: parsed.data.yookassaWeeklyPriceRub,
      yookassaMonthlyPriceRub: parsed.data.yookassaMonthlyPriceRub,
      weeklyIntervalDays: parsed.data.weeklyIntervalDays,
      monthlyIntervalDays: parsed.data.monthlyIntervalDays,
      weeklyAppleProductId: parsed.data.weeklyAppleProductId,
      monthlyAppleProductId: parsed.data.monthlyAppleProductId,
      actorId: session.user.id,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

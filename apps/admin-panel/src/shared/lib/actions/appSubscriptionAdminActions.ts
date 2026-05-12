"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import {
  getDefaultAppSubscriptionSettings,
  updateDefaultAppSubscriptionSettings,
} from "@gafus/core/services/appSubscription";
import { getErrorMessage } from "@gafus/core/errors";

const settingsSchema = z.object({
  yookassaWeeklyPriceRub: z.coerce.number().min(1).max(100000),
  appleProductId: z.string().trim().min(1).max(255).nullable(),
});

export async function getAppSubscriptionSettingsAction() {
  const settings = await getDefaultAppSubscriptionSettings();
  return {
    yookassaWeeklyPriceRub: Number(settings?.yookassaWeeklyPriceRub ?? 200),
    appleProductId: settings?.appleProductId ?? null,
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
      yookassaWeeklyPriceRub: parsed.data.yookassaWeeklyPriceRub,
      appleProductId: parsed.data.appleProductId,
      actorId: session.user.id,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

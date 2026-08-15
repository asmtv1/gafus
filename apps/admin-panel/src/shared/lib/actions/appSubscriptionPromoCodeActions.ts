"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@gafus/auth";
import {
  AppSubscriptionPromoCodeDomainError,
  archiveAppSubscriptionPromoCode,
  createAppSubscriptionPromoCode,
  updateAppSubscriptionPromoCode,
} from "@gafus/core/services/appSubscription";
import { getErrorMessage } from "@gafus/core/errors";

const promoCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const discountSchema = z.coerce.number().int().min(1).max(50);

const createSchema = z
  .object({
    code: promoCodeSchema,
    discountPercent: discountSchema,
    isActive: z.boolean(),
  })
  .strict();

const updateSchema = z
  .object({
    id: z.string().min(1).max(128),
    discountPercent: discountSchema,
    isActive: z.boolean(),
  })
  .strict();

const archiveSchema = z.object({ id: z.string().min(1).max(128) }).strict();

type PromoActionResult = { success: true } | { success: false; error: string; code?: string };

async function requireAdmin(): Promise<
  { success: true; actorId: string } | { success: false; result: PromoActionResult }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, result: { success: false, error: "Не авторизован" } };
  }
  if (session.user.role !== "ADMIN") {
    return {
      success: false,
      result: { success: false, error: "Изменять промокоды может только ADMIN" },
    };
  }
  return { success: true, actorId: session.user.id };
}

function actionError(error: unknown): PromoActionResult {
  if (error instanceof AppSubscriptionPromoCodeDomainError) {
    return { success: false, error: error.message, code: error.code };
  }
  return { success: false, error: getErrorMessage(error, "Не удалось изменить промокод") };
}

export async function createAppSubscriptionPromoCodeAction(
  payload: unknown,
): Promise<PromoActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth.result;
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: "Проверьте код и скидку от 1% до 50%",
      code: "VALIDATION_ERROR",
    };
  }

  try {
    await createAppSubscriptionPromoCode({ ...parsed.data, actorId: auth.actorId });
    revalidatePath("/main-panel/app-subscriptions");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateAppSubscriptionPromoCodeAction(
  payload: unknown,
): Promise<PromoActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth.result;
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: "Проверьте скидку от 1% до 50%", code: "VALIDATION_ERROR" };
  }

  try {
    await updateAppSubscriptionPromoCode({ ...parsed.data, actorId: auth.actorId });
    revalidatePath("/main-panel/app-subscriptions");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveAppSubscriptionPromoCodeAction(
  payload: unknown,
): Promise<PromoActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth.result;
  const parsed = archiveSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: "Некорректный промокод", code: "VALIDATION_ERROR" };
  }

  try {
    await archiveAppSubscriptionPromoCode({ id: parsed.data.id, actorId: auth.actorId });
    revalidatePath("/main-panel/app-subscriptions");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

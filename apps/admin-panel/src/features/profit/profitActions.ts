"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@gafus/auth";
import {
  cancelProfitVideoExpense,
  saveProfitVideoExpense,
} from "@gafus/core/services/appSubscription";

const inputSchema = z.object({
  requestKey: z.string().regex(/^[\w-]{16,64}$/),
  id: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
  input: z.object({
    partnerId: z.string().min(1),
    paidDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    quantity: z.number().int().min(1).max(10_000),
    comment: z.string().max(512).optional(),
  }),
});

async function adminId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id && session.user.role === "ADMIN" ? session.user.id : null;
}

function actionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^(Некоррект|Недостаточно|Креатор не|Ключ операции|Запись уже)/.test(message)
    ? message
    : "Не удалось сохранить изменение. Попробуйте ещё раз";
}

export async function saveVideoExpenseAction(payload: unknown) {
  const actorId = await adminId();
  if (!actorId) return { success: false as const, error: "Недостаточно прав" };
  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) return { success: false as const, error: "Проверьте поля формы" };
  try {
    await saveProfitVideoExpense({ ...parsed.data, actorId });
    revalidatePath("/main-panel/profit");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: actionError(error) };
  }
}

export async function cancelVideoExpenseAction(payload: unknown) {
  const actorId = await adminId();
  if (!actorId) return { success: false as const, error: "Недостаточно прав" };
  const parsed = z
    .object({ id: z.string().min(1), version: z.number().int().positive() })
    .safeParse(payload);
  if (!parsed.success) return { success: false as const, error: "Некорректная запись" };
  try {
    await cancelProfitVideoExpense(actorId, parsed.data.id, parsed.data.version);
    revalidatePath("/main-panel/profit");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: actionError(error) };
  }
}

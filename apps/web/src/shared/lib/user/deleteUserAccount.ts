"use server";

import { getErrorMessage } from "@gafus/core/errors";
import {
  deleteUserAccount as deleteUserAccountService,
  deleteUserAccountBodySchema,
  requestAccountDeletionCode as requestAccountDeletionCodeService,
} from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { checkAuthRateLimit, getClientIpFromHeaders } from "@shared/lib/rateLimit";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-delete-user-account");

export type DeleteUserAccountActionState =
  | { success: true }
  | { success: false; error: string };

export type RequestDeletionCodeActionState =
  | { success: true; message?: string }
  | { success: false; error: string };

/**
 * Письмо с 6-значным кодом на email профиля (throttle на стороне core).
 */
export async function requestAccountDeletionCodeAction(): Promise<RequestDeletionCodeActionState> {
  const userId = await getCurrentUserId();
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "account-deletion-code")) {
    return { success: false, error: "Слишком много запросов. Попробуйте позже." };
  }

  try {
    const result = await requestAccountDeletionCodeService(userId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      message: "Код отправлен на ваш email. Срок действия — 15 минут.",
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Ошибка запроса кода удаления",
      error instanceof Error ? error : new Error(String(error)),
      { userId },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Не удалось отправить код"),
    };
  }
}

/**
 * Удаляет аккаунт после проверки кода, сбрасывает сессию NextAuth и перенаправляет на /login.
 */
export async function submitDeleteUserAccount(
  _prevState: DeleteUserAccountActionState | undefined,
  formData: FormData,
): Promise<DeleteUserAccountActionState> {
  const userId = await getCurrentUserId();
  const ip = await getClientIpFromHeaders();
  if (!checkAuthRateLimit(ip, "account-deletion-submit")) {
    return { success: false, error: "Слишком много попыток. Попробуйте позже." };
  }

  const parsed = deleteUserAccountBodySchema.safeParse({
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { success: false, error: "Введите 6-значный код из письма" };
  }

  let result: Awaited<ReturnType<typeof deleteUserAccountService>>;
  try {
    result = await deleteUserAccountService({
      actorUserId: userId,
      ...parsed.data,
    });
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Ошибка удаления аккаунта",
      error instanceof Error ? error : new Error(String(error)),
      { userId },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Не удалось удалить аккаунт"),
    };
  }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath("/profile");
  const cookieStore = await cookies();
  cookieStore.delete("next-auth.session-token");
  cookieStore.delete("next-auth.callback-url");
  cookieStore.delete("next-auth.csrf-token");
  redirect("/login");
}

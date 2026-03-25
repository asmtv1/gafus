"use server";

import { getErrorMessage } from "@gafus/core/errors";
import {
  deleteUserAccount as deleteUserAccountService,
  deleteUserAccountBodySchema,
} from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-delete-user-account");

export type DeleteUserAccountActionState =
  | { success: true }
  | { success: false; error: string };

/**
 * Удаляет аккаунт текущего пользователя, сбрасывает сессию NextAuth и перенаправляет на /login.
 */
export async function submitDeleteUserAccount(
  _prevState: DeleteUserAccountActionState | undefined,
  formData: FormData,
): Promise<DeleteUserAccountActionState> {
  const userId = await getCurrentUserId();

  const parsed = deleteUserAccountBodySchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: "Проверьте введённые данные" };
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

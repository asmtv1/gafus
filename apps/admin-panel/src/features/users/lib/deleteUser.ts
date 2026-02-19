"use server";

import { createAdminPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { deleteUserAdmin } from "@gafus/core/services/adminUser";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

const logger = createAdminPanelLogger("delete-user");

export async function deleteUser(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string };
  } | null;

  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован" };
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return { success: false, error: "Недостаточно прав" };
  }

  try {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return { success: false, error: "ID пользователя обязателен" };
    }

    const result = await deleteUserAdmin(userId, session.user.id);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    logger.success("Пользователь успешно удален", {
      userId,
      deletedBy: session.user.id,
    });
    revalidatePath("/main-panel/users");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении пользователя", error as Error);
    return { success: false, error: "Не удалось удалить пользователя" };
  }
}

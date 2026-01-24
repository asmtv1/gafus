import { createAdminPanelLogger } from "@gafus/logger";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

// Создаем логгер для admin-panel-update-user
const logger = createAdminPanelLogger("update-user");

export async function updateUser(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = (await getServerSession(authOptions)) as {
      user: { id: string; username: string; role: string };
    } | null;

    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    // Проверяем, что пользователь является админом или модератором
    if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
      return { success: false, error: "Недостаточно прав" };
    }

    const id = formData.get("id") as string;
    const username = formData.get("username") as string;
    const phone = formData.get("phone") as string;
    const role = formData.get("role") as string;

    if (!id) {
      return { success: false, error: "ID пользователя обязателен" };
    }

    const updateData: Record<string, unknown> = {};
    if (username) updateData.username = username;
    if (phone) updateData.phone = phone;
    if (role) updateData.role = role;

    await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении пользователя:", error as Error);

    // Проверяем, является ли ошибка связанной с контекстом
    if (
      error instanceof Error &&
      error.message.includes("headers was called outside a request scope")
    ) {
      return { success: false, error: "Ошибка аутентификации. Попробуйте перезагрузить страницу." };
    }

    return { success: false, error: "Не удалось обновить пользователя" };
  }
}

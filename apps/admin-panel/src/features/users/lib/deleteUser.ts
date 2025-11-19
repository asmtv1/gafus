"use server";

import { createAdminPanelLogger } from "@gafus/logger";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

// Создаем логгер для admin-panel-delete-user
const logger = createAdminPanelLogger('delete-user');

export async function deleteUser(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const session = (await getServerSession(authOptions)) as { user: { id: string; username: string; role: string } } | null;

  if (!session?.user?.id) {
    return { success: false, error: "Не авторизован" };
  }

  // Проверяем, что пользователь является админом или модератором
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    return { success: false, error: "Недостаточно прав" };
  }

  try {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return { success: false, error: "ID пользователя обязателен" };
    }

    // Проверяем, что пользователь не пытается удалить сам себя
    if (session.user.id === userId) {
      return { success: false, error: "Нельзя удалить самого себя" };
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    logger.success("Пользователь успешно удален", { userId, deletedBy: session.user.id });

    // Обновляем кэш страницы со списком пользователей
    revalidatePath("/main-panel/users");

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении пользователя:", error as Error);
    
    // Обработка специфичных ошибок Prisma
    if (error instanceof Error) {
      // Ошибка внешнего ключа или других ограничений
      if (error.message.includes("Foreign key constraint") || error.message.includes("constraint")) {
        return { success: false, error: "Не удалось удалить пользователя из-за связанных данных" };
      }
      
      // Пользователь не найден
      if (error.message.includes("Record to delete does not exist")) {
        return { success: false, error: "Пользователь не найден" };
      }
    }
    
    return { success: false, error: "Не удалось удалить пользователя" };
  }
}


"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("ai-chat-clear-history");

export interface ClearChatHistoryResult {
  success: boolean;
  error?: string;
  message?: string;
}

export async function clearChatHistory(): Promise<ClearChatHistoryResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: "Вы не авторизованы" };
    }

    // Проверяем роль пользователя
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    const trainerId = session.user.id;

    // Удаляем все сообщения тренера
    const result = await prisma.trainerAIChat.deleteMany({
      where: { trainerId },
    });

    logger.success("Chat history cleared", {
      trainerId,
      deletedCount: result.count,
    });

    return {
      success: true,
      message: `Удалено ${result.count} сообщений`,
    };
  } catch (error) {
    logger.error("Error in clearChatHistory", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

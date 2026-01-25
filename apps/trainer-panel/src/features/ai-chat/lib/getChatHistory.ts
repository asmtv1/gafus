"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("ai-chat-get-history");

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokensUsed?: number | null;
  attachments?: any;
  createdAt: Date;
}

export interface GetChatHistoryResult {
  success: boolean;
  error?: string;
  data?: {
    messages: ChatMessage[];
    hasMore: boolean;
    total: number;
  };
}

export async function getChatHistory(
  page: number = 0,
  pageSize: number = 20,
): Promise<GetChatHistoryResult> {
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

    // Получаем общее количество сообщений
    const total = await prisma.trainerAIChat.count({
      where: { trainerId },
    });

    // Получаем последние N сообщений
    // Сортируем по createdAt (от новых к старым), затем по id для стабильности при одинаковом времени
    const messages = await prisma.trainerAIChat.findMany({
      where: { trainerId },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }, // Дополнительная сортировка по ID для стабильности
      ],
      take: pageSize,
      skip: page * pageSize,
      select: {
        id: true,
        role: true,
        content: true,
        tokensUsed: true,
        attachments: true,
        createdAt: true,
      },
    });

    const hasMore = total > (page + 1) * pageSize;

    // Переворачиваем массив для правильного порядка отображения (от старых к новым)
    // И дополнительно сортируем по createdAt и id для гарантии правильного порядка
    const sortedMessages = [...messages].reverse().sort((a, b) => {
      const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      // Если время одинаковое, сортируем по ID (раньше созданный = меньший ID в cuid)
      return a.id.localeCompare(b.id);
    });

    return {
      success: true,
      data: {
        messages: sortedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          tokensUsed: msg.tokensUsed,
          attachments: msg.attachments,
          createdAt: msg.createdAt,
        })),
        hasMore,
        total,
      },
    };
  } catch (error) {
    logger.error("Error in getChatHistory", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

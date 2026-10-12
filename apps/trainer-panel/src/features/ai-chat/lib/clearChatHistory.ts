"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { clearTrainerAIHistory } from "@gafus/core";
import { getErrorMessage } from "@gafus/core/errors";
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
    if (!session?.user?.id) return { success: false, error: "Вы не авторизованы" };
    const count = await clearTrainerAIHistory(session.user.id);
    logger.success("Chat history cleared", { trainerId: session.user.id, deletedCount: count });
    return { success: true, message: `Удалено ${count} сообщений` };
  } catch (error) {
    logger.error("Error in clearChatHistory", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getTrainerAIHistory } from "@gafus/core";
import { getErrorMessage } from "@gafus/core/errors";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("ai-chat-get-history");

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokensUsed?: number | null;
  attachments?: unknown;
  createdAt: Date;
}

export interface GetChatHistoryResult {
  success: boolean;
  error?: string;
  data?: { messages: ChatMessage[]; hasMore: boolean; total: number };
}

export async function getChatHistory(
  page = 0,
  pageSize = 20,
): Promise<GetChatHistoryResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { success: false, error: "Вы не авторизованы" };
    const data = await getTrainerAIHistory(session.user.id, page, pageSize);
    return { success: true, data };
  } catch (error) {
    logger.error("Error in getChatHistory", error as Error);
    return { success: false, error: getErrorMessage(error, "Неизвестная ошибка") };
  }
}

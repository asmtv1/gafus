"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { callOpenRouterAPI } from "./providers/openrouter";
import { decryptApiKey } from "./encryption";

const logger = createTrainerPanelLogger("ai-chat-send-message");

const sendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

// Более точная оценка: ~4 символа на токен для русского/английского текста
const MAX_CONTEXT_TOKENS = 8000;
const CHARS_PER_TOKEN = 4; // Приблизительно
const MAX_CONTEXT_LENGTH = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN; // 32000 символов

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: {
    userMessageId: string;
    assistantMessageId: string;
    content: string;
    tokensUsed?: number;
  };
}

export async function sendMessage(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { error: "Вы не авторизованы" };
    }

    // Проверяем роль пользователя
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { error: "Недостаточно прав доступа" };
    }

    const rawMessage = formData.get("message");
    const parseResult = sendMessageSchema.safeParse({
      message: typeof rawMessage === "string" ? rawMessage : undefined,
    });

    if (!parseResult.success) {
      return {
        error: parseResult.error.errors[0]?.message ?? "Некорректные данные запроса",
      };
    }

    const { message: userMessage } = parseResult.data;
    const trainerId = session.user.id;
    const selectedModel = formData.get("model") as string | null;

    // Получаем конфигурацию тренера
    const config = await prisma.trainerAIConfig.findUnique({
      where: { trainerId },
    });

    // Проверяем наличие общего ключа в env
    const hasCommonApiKey = !!process.env.OPENROUTER_API_KEY;

    if ((!config || !config.enabled) && !hasCommonApiKey) {
      return {
        error: "AI чат не настроен или отключен. Обратитесь к администратору для настройки.",
      };
    }

    // Получаем API ключ: индивидуальный или общий из env
    const provider = "openrouter";
    const isEnabled = config ? config.enabled : true;

    if (!isEnabled && !hasCommonApiKey) {
      return {
        error: "AI чат отключен в настройках.",
      };
    }
    let apiKey: string;

    if (config?.apiKey) {
      // Используем индивидуальный ключ тренера (если назначен админом)
      try {
        apiKey = decryptApiKey(config.apiKey);
      } catch (error) {
        logger.error("Failed to decrypt individual API key", error as Error, { trainerId });
        return {
          error: "Ошибка при расшифровке индивидуального API ключа. Обратитесь к администратору.",
        };
      }
    } else {
      // Используем общий ключ из env переменных
      apiKey = process.env.OPENROUTER_API_KEY || "";

      if (!apiKey) {
        logger.error("OPENROUTER_API_KEY not configured", new Error("Missing env variable"), {
          trainerId,
        });
        return {
          error: "AI чат временно недоступен. Обратитесь к администратору.",
        };
      }
    }

    // Загружаем последние 50 сообщений для контекста
    const recentMessages = await prisma.trainerAIChat.findMany({
      where: { trainerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        role: true,
        content: true,
      },
    });

    // Формируем массив messages для API с ограничением по длине
    const messagesForAPI: { role: "user" | "assistant" | "system"; content: string }[] = [
      {
        role: "system",
        content: "Ты - помощник для кинолога (тренера собак). Отвечай профессионально и по делу.",
      },
    ];

    let totalLength = 0;

    // Добавляем сообщения с конца (самые старые из последних 50)
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const msgLength = msg.content.length;

      if (totalLength + msgLength > MAX_CONTEXT_LENGTH) {
        break;
      }

      messagesForAPI.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });

      totalLength += msgLength;
    }

    // Добавляем текущее сообщение пользователя
    messagesForAPI.push({
      role: "user",
      content: userMessage,
    });

    // Вызываем AI API
    let aiResponse: { content: string; tokensUsed?: number };
    const useModel = selectedModel || config?.model || "meta-llama/llama-3.3-70b-instruct";

    try {
      aiResponse = await callOpenRouterAPI(apiKey, messagesForAPI, useModel);
    } catch (error) {
      logger.error("OpenRouter API error", error as Error, { trainerId });
      return {
        error: error instanceof Error ? error.message : "Ошибка при обращении к AI API",
      };
    }

    // Сохраняем оба сообщения в транзакции
    const result = await prisma.$transaction(async (tx) => {
      const userMsg = await tx.trainerAIChat.create({
        data: {
          trainerId,
          role: "user",
          content: userMessage,
          model: useModel,
        },
      });

      const assistantMsg = await tx.trainerAIChat.create({
        data: {
          trainerId,
          role: "assistant",
          content: aiResponse.content,
          tokensUsed: aiResponse.tokensUsed ?? null,
          model: useModel,
        },
      });

      return { userMsg, assistantMsg };
    });

    logger.success("Message sent successfully", {
      trainerId,
      userMessageId: result.userMsg.id,
      assistantMessageId: result.assistantMsg.id,
      tokensUsed: aiResponse.tokensUsed,
    });

    return {
      success: true,
      data: {
        userMessageId: result.userMsg.id,
        assistantMessageId: result.assistantMsg.id,
        content: aiResponse.content,
        tokensUsed: aiResponse.tokensUsed,
      },
    };
  } catch (error) {
    logger.error("Error in sendMessage", error as Error);
    return {
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

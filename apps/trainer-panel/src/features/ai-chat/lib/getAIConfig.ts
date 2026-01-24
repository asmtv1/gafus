"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("ai-chat-get-config");

export interface AIConfig {
  model: string;
  enabled: boolean;
  hasApiKey: boolean; // Только флаг наличия ключа, не сам ключ
}

export interface GetAIConfigResult {
  success: boolean;
  error?: string;
  data?: AIConfig;
}

export async function getAIConfig(): Promise<GetAIConfigResult> {
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

    // Получаем конфигурацию БЕЗ API ключа
    const config = await prisma.trainerAIConfig.findUnique({
      where: { trainerId },
      select: {
        model: true,
        enabled: true,
        apiKey: true, // Получаем только для проверки наличия индивидуального ключа
      },
    });

    // Проверяем наличие общего ключа в env
    const hasCommonApiKey = !!process.env.OPENROUTER_API_KEY;

    if (!config) {
      return {
        success: true,
        data: {
          model: "meta-llama/llama-3.3-70b-instruct",
          enabled: true, // По умолчанию включено, если есть общий ключ
          hasApiKey: hasCommonApiKey,
        },
      };
    }

    return {
      success: true,
      data: {
        model: config.model,
        enabled: config.enabled,
        hasApiKey: !!config.apiKey || hasCommonApiKey,
      },
    };
  } catch (error) {
    logger.error("Error in getAIConfig", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

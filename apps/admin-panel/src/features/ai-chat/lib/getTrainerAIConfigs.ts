"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createAdminPanelLogger } from "@gafus/logger";

const logger = createAdminPanelLogger("admin-ai-chat-configs");

export interface TrainerAIConfigData {
  id: string;
  trainerId: string;
  trainerUsername: string;
  hasIndividualApiKey: boolean;
  model: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetTrainerAIConfigsResult {
  success: boolean;
  error?: string;
  data?: TrainerAIConfigData[];
}

export async function getTrainerAIConfigs(): Promise<GetTrainerAIConfigsResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: "Вы не авторизованы" };
    }

    // Только админы могут просматривать конфигурации
    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    // Получаем всех тренеров
    const trainers = await prisma.user.findMany({
      where: {
        role: {
          in: ["TRAINER", "ADMIN", "MODERATOR"],
        },
      },
      select: {
        id: true,
        username: true,
      },
    });

    // Получаем все конфигурации с информацией о тренерах
    const configs = await prisma.trainerAIConfig.findMany({
      include: {
        trainer: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Создаем Map для быстрого поиска конфигураций
    const configMap = new Map(configs.map((c) => [c.trainerId, c]));

    // Объединяем тренеров с их конфигурациями (если есть)
    const result: TrainerAIConfigData[] = trainers.map((trainer) => {
      const config = configMap.get(trainer.id);
      if (config) {
        return {
          id: config.id,
          trainerId: config.trainerId,
          trainerUsername: trainer.username,
          hasIndividualApiKey: !!config.apiKey,
          model: config.model,
          enabled: config.enabled,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        };
      } else {
        // Тренер без конфигурации - использует общий ключ из env
        // Админ может создать конфигурацию через форму редактирования
        return {
          id: `temp-${trainer.id}`, // Временный ID для React key
          trainerId: trainer.id,
          trainerUsername: trainer.username,
          hasIndividualApiKey: false,
          model: "llama-3.1-8b-instant",
          enabled: false, // По умолчанию отключено, админ может включить
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error("Error in getTrainerAIConfigs", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

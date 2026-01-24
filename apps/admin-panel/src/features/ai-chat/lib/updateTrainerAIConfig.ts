"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createAdminPanelLogger } from "@gafus/logger";
import { encryptApiKey } from "./encryption";
import { callOpenRouterAPI } from "./providers/openrouter";

const logger = createAdminPanelLogger("admin-update-ai-config");

// Валидация модели OpenRouter
const VALID_MODELS = [
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-r1",
  "meta-llama/llama-3.1-405b-instruct",
] as const;

function validateModel(model: string): model is (typeof VALID_MODELS)[number] {
  return VALID_MODELS.includes(model as (typeof VALID_MODELS)[number]);
}

const updateAIConfigSchema = z.object({
  trainerId: z.string().min(1),
  apiKey: z.string().optional(), // Опциональный - если не указан, используется общий ключ из env
  provider: z.string().default("openrouter"),
  model: z.string().default("meta-llama/llama-3.3-70b-instruct"),
  enabled: z.boolean().default(true),
  validateKey: z.boolean().optional().default(false),
});

export interface UpdateTrainerAIConfigResult {
  success: boolean;
  error?: string;
  message?: string;
}

export async function updateTrainerAIConfig(
  prevState: UpdateTrainerAIConfigResult,
  formData: FormData,
): Promise<UpdateTrainerAIConfigResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: "Вы не авторизованы" };
    }

    // Только админы могут управлять конфигурациями
    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return {
        success: false,
        error: "Недостаточно прав доступа. Только администраторы могут управлять API ключами.",
      };
    }

    const rawTrainerId = formData.get("trainerId");
    const rawApiKey = formData.get("apiKey");
    const rawModel = formData.get("model");
    const rawEnabled = formData.get("enabled");
    const rawValidateKey = formData.get("validateKey");

    // Правильная обработка boolean из FormData
    const enabledValue =
      rawEnabled === "true" ||
      rawEnabled === "on" ||
      (typeof rawEnabled === "boolean" && rawEnabled);
    const validateKeyValue =
      rawValidateKey === "true" ||
      rawValidateKey === "on" ||
      (typeof rawValidateKey === "boolean" && rawValidateKey);

    const parseResult = updateAIConfigSchema.safeParse({
      trainerId: typeof rawTrainerId === "string" ? rawTrainerId : undefined,
      apiKey: typeof rawApiKey === "string" && rawApiKey.trim() ? rawApiKey.trim() : undefined,
      provider: "openrouter",
      model: typeof rawModel === "string" ? rawModel : "meta-llama/llama-3.3-70b-instruct",
      enabled: enabledValue,
      validateKey: validateKeyValue,
    });

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message ?? "Некорректные данные запроса",
      };
    }

    const { trainerId, apiKey, provider, model, enabled, validateKey } = parseResult.data;

    // Проверяем, что тренер существует
    const trainer = await prisma.user.findUnique({
      where: { id: trainerId },
      select: { id: true, role: true },
    });

    if (!trainer) {
      return { success: false, error: "Тренер не найден" };
    }

    // Проверяем, что это тренер
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(trainer.role)) {
      return { success: false, error: "Пользователь не является тренером" };
    }

    // Валидация модели
    if (!validateModel(model)) {
      return {
        success: false,
        error: `Неподдерживаемая модель OpenRouter: ${model}. Доступны: ${VALID_MODELS.join(", ")}`,
      };
    }

    // Если указан индивидуальный ключ, валидируем и шифруем его
    let encryptedApiKey: string | null = null;
    if (apiKey) {
      // Опциональная валидация ключа через тестовый запрос
      if (validateKey) {
        try {
          await callOpenRouterAPI(apiKey, [{ role: "user", content: "test" }], model);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Не удалось проверить API ключ OpenRouter",
          };
        }
      }

      // Шифруем API ключ перед сохранением
      try {
        encryptedApiKey = encryptApiKey(apiKey);
      } catch (error) {
        logger.error("Failed to encrypt API key", error as Error, { trainerId });
        return {
          success: false,
          error: "Ошибка при шифровании API ключа",
        };
      }
    }
    // Если apiKey не указан, encryptedApiKey останется null - будет использоваться общий ключ из env

    // Upsert конфигурации
    await prisma.trainerAIConfig.upsert({
      where: { trainerId },
      create: {
        trainerId,
        provider,
        apiKey: encryptedApiKey, // null если не указан - будет использоваться общий ключ
        model,
        enabled,
      },
      update: {
        provider,
        apiKey: encryptedApiKey, // null для удаления индивидуального ключа (вернется к общему)
        model,
        enabled,
      },
    });

    logger.success("Trainer AI config updated", {
      trainerId,
      model,
      enabled,
      hasIndividualKey: !!encryptedApiKey,
      // НЕ логируем API ключ, даже зашифрованный
    });

    return {
      success: true,
      message: "Настройки успешно сохранены",
    };
  } catch (error) {
    logger.error("Error in updateTrainerAIConfig", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { encryptApiKey } from "./encryption";
import { callOpenRouterAPI } from "./providers/openrouter";

const logger = createTrainerPanelLogger("ai-chat-save-config");

// Валидация модели OpenRouter
const VALID_MODELS = [
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-r1",
  "meta-llama/llama-3.1-405b-instruct",
] as const;

function validateModel(model: string): model is (typeof VALID_MODELS)[number] {
  return VALID_MODELS.includes(model as (typeof VALID_MODELS)[number]);
}

const saveAIConfigSchema = z.object({
  apiKey: z.string().optional(), // Опциональный - если не указан, используется общий ключ из env
  provider: z.string().default("openrouter"),
  model: z.string().default("meta-llama/llama-3.3-70b-instruct"),
  enabled: z.boolean().default(true),
  validateKey: z.boolean().optional().default(false), // Опциональная валидация через тестовый запрос
});

export interface SaveAIConfigResult {
  success: boolean;
  error?: string;
  message?: string;
}

export async function saveAIConfig(
  prevState: SaveAIConfigResult,
  formData: FormData,
): Promise<SaveAIConfigResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: "Вы не авторизованы" };
    }

    // Только админы могут управлять API ключами
    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return {
        success: false,
        error: "Недостаточно прав доступа. Только администраторы могут управлять API ключами.",
      };
    }

    // Админ может управлять ключами для любого тренера
    const rawTrainerId = formData.get("trainerId");
    const trainerId = typeof rawTrainerId === "string" ? rawTrainerId : session.user.id;

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

    const parseResult = saveAIConfigSchema.safeParse({
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

    const { apiKey, provider, model, enabled, validateKey } = parseResult.data;

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
          logger.warn("API key validation failed", {
            trainerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            error: error instanceof Error ? error.message : "Не удалось проверить API ключ",
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

    logger.success("AI config saved", {
      trainerId,
      model,
      enabled,
      // НЕ логируем API ключ, даже зашифрованный
    });

    return {
      success: true,
      message: "Настройки успешно сохранены",
    };
  } catch (error) {
    logger.error("Error in saveAIConfig", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

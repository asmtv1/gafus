"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { validateForm } from "@shared/lib/validation/serverValidation";
import { revalidatePath } from "next/cache";
import {
  deleteFileFromCDN,
  uploadFileToCDN,
  getRelativePathFromCDNUrl,
  getStepImagePath,
} from "@gafus/cdn-upload";
import { randomUUID } from "crypto";
import { Prisma } from "@gafus/prisma";
import { invalidateTrainingDaysCache } from "@shared/lib/actions/invalidateTrainingDaysCache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

import type { ActionResult, ChecklistQuestion } from "@gafus/types";

// Создаем логгер для update-step
const logger = createTrainerPanelLogger("trainer-panel-update-step");

const MAX_COMMENT_LENGTH = 500;

export async function updateStep(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const id = formData.get("id")?.toString() || "";
    if (!id) return { error: "ID шага обязателен" };

    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const durationStr = formData.get("duration")?.toString() || "";
    const estimatedDurationMinutesStr = formData.get("estimatedDurationMinutes")?.toString() || "";
    const videoUrl = formData.get("videoUrl")?.toString() || "";
    const type = formData.get("type")?.toString() || "TRAINING";
    const checklistStr = formData.get("checklist")?.toString() || "";

    // Поля для типов экзамена
    const requiresVideoReport = formData.get("requiresVideoReport")?.toString() === "true";
    const requiresWrittenFeedback = formData.get("requiresWrittenFeedback")?.toString() === "true";
    const hasTestQuestions = formData.get("hasTestQuestions")?.toString() === "true";

    const imageFiles = formData.getAll("images") as File[];
    const deletedImages = formData.getAll("deletedImages").map(String);
    const pdfUrls = formData.getAll("pdfUrls").map(String);

    const validation = validateForm(
      {
        title,
        description,
        duration: type === "TRAINING" || type === "BREAK" ? durationStr : "",
        videoUrl: type === "TRAINING" || type === "THEORY" || type === "PRACTICE" ? videoUrl : "",
        type,
        checklist: type === "EXAMINATION" ? checklistStr : "",
      },
      {
        title: (value: unknown) => {
          const v = String(value ?? "");
          if (!v || v.trim().length === 0) return "Название обязательно";
          if (v.length < 3) return "Минимум 3 символа";
          if (v.length > 100) return "Максимум 100 символов";
          return null;
        },
        description: (value: unknown) => {
          const v = String(value ?? "");
          if (!v || v.trim().length === 0) return "Описание обязательно";
          if (v.length < 10) return "Минимум 10 символов";
          if (v.length > 3000) return "Максимум 3000 символов";
          return null;
        },
        duration: (value: unknown) => {
          const v = String(value ?? "");
          // Для экзаменационных шагов длительность не обязательна
          if (!v || v.trim().length === 0) return null;
          const num = parseInt(v, 10);
          if (isNaN(num)) return "Должно быть числом";
          if (num <= 0) return "Должно быть положительным числом";
          if (num > 6000) return "Максимум 6000 секунд";
          return null;
        },
        videoUrl: (value: unknown) => {
          const v = String(value ?? "");
          if (!v) return null;

          // Поддерживаем внешние ссылки и CDN
          const externalUrlPattern =
            /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com|vk\.com|vkvideo\.ru)\/.+/;
          const cdnUrlPattern = /^https:\/\/gafus-media\.storage\.yandexcloud\.net\/uploads\/.+/;

          const isValid = externalUrlPattern.test(v) || cdnUrlPattern.test(v);
          return isValid ? null : "Неверный формат ссылки на видео";
        },
        type: (value: unknown) => {
          const v = String(value ?? "");
          if (!v || v.trim().length === 0) return "Тип шага обязателен";
          if (!["TRAINING", "EXAMINATION", "THEORY", "BREAK", "PRACTICE", "DIARY"].includes(v))
            return "Неверный тип шага";
          return null;
        },
        checklist: (value: unknown) => {
          const v = String(value ?? "");
          // Если выбраны тестовые вопросы, то чек-лист обязателен
          if (hasTestQuestions) {
            if (!v) return "Для тестовых вопросов необходимо добавить хотя бы один вопрос";
            try {
              const checklist = JSON.parse(v);
              if (!Array.isArray(checklist)) return "Чек-лист должен быть массивом";
              if (checklist.length === 0) return "Добавьте хотя бы один вопрос";
              for (const question of checklist) {
                if (typeof question !== "object" || question === null) {
                  return "Каждый вопрос чек-листа должен быть объектом";
                }
                if (!question.id || typeof question.id !== "string") {
                  return "Каждый вопрос должен иметь идентификатор";
                }
                if (!question.question || question.question.trim().length === 0) {
                  return "Все вопросы должны иметь текст";
                }
                if (!Array.isArray(question.options) || question.options.length < 2) {
                  return "Каждый вопрос должен иметь минимум 2 варианта ответа";
                }
                if (question.options.some((opt: string) => !opt || opt.trim().length === 0)) {
                  return "Все варианты ответов должны быть заполнены";
                }
                if (question.comment != null) {
                  if (typeof question.comment !== "string") {
                    return "Комментарий к вопросу должен быть строкой";
                  }
                  if (question.comment.trim().length > MAX_COMMENT_LENGTH) {
                    return `Комментарий к вопросу не должен превышать ${MAX_COMMENT_LENGTH} символов`;
                  }
                }
              }
              return null;
            } catch {
              return "Неверный формат чек-листа";
            }
          }
          return null; // Если тестовые вопросы не выбраны, чек-лист не нужен
        },
      },
    );

    if (!validation.isValid) {
      return { error: `Ошибка валидации: ${Object.values(validation.errors).join(", ")}` };
    }

    // Дополнительная валидация для экзаменационных шагов
    if (type === "EXAMINATION") {
      if (!hasTestQuestions && !requiresVideoReport && !requiresWrittenFeedback) {
        return { error: "Для экзаменационного шага выберите хотя бы один тип экзамена" };
      }
    }

    const duration =
      type === "TRAINING" || type === "BREAK" ? parseInt(durationStr, 10) : null;
    const estimatedDurationSec =
      type === "TRAINING" ||
      type === "DIARY" ||
      estimatedDurationMinutesStr.trim().length === 0
        ? null
        : parseInt(estimatedDurationMinutesStr, 10) * 60;
    const checklist =
      hasTestQuestions && checklistStr ? (JSON.parse(checklistStr) as ChecklistQuestion[]) : null;
    const normalizedChecklist = checklist
      ? checklist.map((question) => ({
          ...question,
          comment:
            typeof question.comment === "string" && question.comment.trim().length > 0
              ? question.comment.trim()
              : undefined,
        }))
      : null;
    const checklistValue =
      hasTestQuestions && normalizedChecklist ? normalizedChecklist : Prisma.JsonNull;

    // Получаем trainerId из сессии
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Вы не авторизованы" };
    }
    const trainerId = session.user.id;
    const stepId = id;

    // Получаем существующие изображения
    const existingStep = await prisma.step.findUnique({
      where: { id },
      select: { imageUrls: true },
    });

    // Формируем финальный массив изображений (существующие + новые - удаленные)
    const existingImageUrls = existingStep?.imageUrls || [];
    const remainingImageUrls = existingImageUrls.filter((url) => !deletedImages.includes(url));

    // Загружаем новые изображения в CDN (для тренировочных, теоретических и практических шагов)
    const newImageUrls: string[] = [];
    if (
      (type === "TRAINING" || type === "THEORY" || type === "PRACTICE") &&
      imageFiles.length > 0
    ) {
      try {
        logger.info(
          `🔄 Загружаем ${imageFiles.length} новых изображений в CDN для обновления шага`,
        );

        for (const file of imageFiles) {
          const ext = file.name.split(".").pop() || "jpg";
          const relativePath = getStepImagePath(trainerId, stepId, randomUUID(), ext);

          const fileUrl = await uploadFileToCDN(file, relativePath);
          newImageUrls.push(fileUrl);
        }

        logger.info(`✅ Загружено ${newImageUrls.length} новых изображений в CDN`);
      } catch (error) {
        logger.error("❌ Ошибка загрузки новых изображений в CDN", error as Error);
        return { error: "Не удалось загрузить новые изображения" };
      }
    }

    // Удаляем изображения, помеченные пользователем для удаления
    if (deletedImages.length > 0) {
      try {
        logger.info(`🗑️ Удаляем ${deletedImages.length} изображений, помеченных для удаления`);

        for (const imageUrl of deletedImages) {
          const relativePath = getRelativePathFromCDNUrl(imageUrl);
          await deleteFileFromCDN(relativePath);
        }

        logger.info(`✅ Удалено ${deletedImages.length} изображений, помеченных для удаления`);
      } catch (error) {
        logger.error("❌ Ошибка удаления изображений, помеченных для удаления", error as Error);
        // Не прерываем обновление шага из-за ошибки удаления
      }
    }

    await prisma.step.update({
      where: { id },
      data: {
        title,
        description,
        durationSec: duration,
        estimatedDurationSec,
        type: type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY",
        videoUrl:
          type === "TRAINING" || type === "THEORY" || type === "PRACTICE" ? videoUrl || null : null,
        imageUrls:
          type === "TRAINING" || type === "THEORY" || type === "PRACTICE"
            ? [...remainingImageUrls, ...newImageUrls]
            : [],
        pdfUrls:
          type === "TRAINING" || type === "THEORY" || type === "PRACTICE" ? pdfUrls : [],
        checklist: checklistValue,
        requiresVideoReport: type === "EXAMINATION" ? requiresVideoReport : false,
        requiresWrittenFeedback: type === "EXAMINATION" ? requiresWrittenFeedback : false,
        hasTestQuestions: type === "EXAMINATION" ? hasTestQuestions : false,
      },
    });

    revalidatePath("/main-panel/steps");

    // Инвалидируем кэш дней тренировок, так как изменение типа/длительности шага
    // влияет на расчет времени для всех дней, содержащих этот шаг
    await invalidateTrainingDaysCache();

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении шага:", error as Error, { operation: "error" });
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "updateStep",
        action: "updateStep",
        tags: ["steps", "update"],
      },
    );
    return { error: "Не удалось обновить шаг" };
  }
}

"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { validateForm } from "@shared/lib/validation/serverValidation";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { uploadFileToCDN, deleteFileFromCDN } from "@gafus/cdn-upload";
import { randomUUID } from "crypto";
import { Prisma } from "@gafus/prisma";

import type { ActionResult, ChecklistQuestion } from "@gafus/types";

// Создаем логгер для create-step
const logger = createTrainerPanelLogger('trainer-panel-create-step');

const MAX_COMMENT_LENGTH = 500;

export async function createStep(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const durationStr = formData.get("duration")?.toString() || "";
    const estimatedDurationMinutesStr =
      formData.get("estimatedDurationMinutes")?.toString() || "";
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

    logger.info("Создание шага", {
      operation: 'create_step_start',
      title,
      description,
      durationStr,
      videoUrl,
      type,
      imageFilesCount: imageFiles.length,
      pdfUrlsCount: pdfUrls.length,
      requiresVideoReport,
      requiresWrittenFeedback,
      hasTestQuestions
    });

    // Серверная валидация
    const validation = validateForm(
      {
        title,
        description,
        duration: type === "TRAINING" ? durationStr : "",
        videoUrl: (type === "TRAINING" || type === "THEORY") ? videoUrl : "",
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
          // Для экзаменационных и теоретических шагов длительность не обязательна
          if (type === "EXAMINATION" || type === "THEORY") return null;
          if (!v || v.trim().length === 0) return "Длительность обязательна";
          const num = parseInt(v, 10);
          if (isNaN(num)) return "Должно быть числом";
          if (num <= 0) return "Должно быть положительным числом";
          if (num > 6000) return "Максимум 6000 секунд";
          return null;
        },
        videoUrl: (value: unknown) => {
          const v = String(value ?? "");
          if (!v) return null; // Необязательное поле
          
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
          if (!["TRAINING", "EXAMINATION", "THEORY"].includes(v)) return "Неверный тип шага";
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

    const duration = type === "TRAINING" ? parseInt(durationStr, 10) : null;
    const estimatedDurationSec =
      type === "TRAINING" || estimatedDurationMinutesStr.trim().length === 0
        ? null
        : parseInt(estimatedDurationMinutesStr, 10) * 60;
    const checklist = type === "EXAMINATION" && checklistStr
      ? (JSON.parse(checklistStr) as ChecklistQuestion[])
      : null;
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
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Вы не авторизованы" };
    }
    const authorId = session.user.id;

    // Загружаем изображения в CDN (только для тренировочных шагов)
    const imageUrls: string[] = [];
    if (type === "TRAINING" && imageFiles.length > 0) {
      try {
        logger.info(`🔄 Загружаем ${imageFiles.length} изображений в CDN`);
        
        for (const file of imageFiles) {
          const ext = file.name.split(".").pop();
          const fileName = `${randomUUID()}.${ext}`;
          const relativePath = `steps/${fileName}`;
          
          const fileUrl = await uploadFileToCDN(file, relativePath);
          imageUrls.push(fileUrl);
        }
        
        logger.info(`✅ Загружено ${imageUrls.length} изображений в CDN`);
      } catch (error) {
        logger.error("❌ Ошибка загрузки изображений в CDN", error as Error);
        return { error: "Не удалось загрузить изображения" };
      }
    }

    // Удаляем изображения из CDN (для тренировочных и теоретических шагов)
    if ((type === "TRAINING" || type === "THEORY") && deletedImages.length > 0) {
      try {
        logger.info(`🗑️ Удаляем ${deletedImages.length} изображений из CDN`);
        
        for (const imageUrl of deletedImages) {
          // Извлекаем относительный путь из CDN URL
          let relativePath = imageUrl;
          if (imageUrl.startsWith('https://gafus-media.storage.yandexcloud.net/')) {
            relativePath = imageUrl.replace('https://gafus-media.storage.yandexcloud.net/', '');
          }
          if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
          }
          
          await deleteFileFromCDN(relativePath);
        }
        
        logger.info(`✅ Удалено ${deletedImages.length} изображений из CDN`);
      } catch (error) {
        logger.error("❌ Ошибка удаления изображений из CDN", error as Error);
        // Не прерываем создание шага из-за ошибки удаления
      }
    }

    // Проверяем, что пользователь существует в базе данных
    const user = await prisma.user.findUnique({ where: { id: authorId } });
    if (!user) {
      return { error: "Пользователь не найден в базе данных" };
    }

    const _step = await prisma.step.create({
      data: {
        title,
        description,
        durationSec: duration,
        estimatedDurationSec,
        type: type as "TRAINING" | "EXAMINATION" | "THEORY",
        videoUrl: (type === "TRAINING" || type === "THEORY") ? (videoUrl || null) : null,
        imageUrls: (type === "TRAINING" || type === "THEORY") ? imageUrls : [],
        pdfUrls: (type === "TRAINING" || type === "THEORY") ? pdfUrls : [],
        checklist: checklistValue,
        requiresVideoReport: type === "EXAMINATION" ? requiresVideoReport : false,
        requiresWrittenFeedback: type === "EXAMINATION" ? requiresWrittenFeedback : false,
        hasTestQuestions: type === "EXAMINATION" ? hasTestQuestions : false,
        authorId,
      },
    });

    revalidatePath("/main-panel/steps");

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при создании шага:", error as Error, { operation: 'error' });
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "createStep",
        action: "createStep",
        tags: ["steps", "create"],
      }
    );
    return { error: "Не удалось создать шаг" };
  }
}

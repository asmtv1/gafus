"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

const logger = createTrainerPanelLogger("trainer-panel-create-step-from-template");

interface CreateStepFromTemplateResult {
  success: boolean;
  message: string;
  stepId?: string;
}

/**
 * Создает новый шаг на основе шаблона
 * @param templateId - ID шаблона
 * @returns Результат операции с ID созданного шага
 */
export async function createStepFromTemplate(
  templateId: string,
): Promise<CreateStepFromTemplateResult> {
  try {
    logger.info("Создание шага из шаблона", { templateId });

    // Проверяем авторизацию
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      logger.warn("Неавторизованная попытка создания шага из шаблона");
      return {
        success: false,
        message: "Необходима авторизация",
      };
    }

    // Проверяем роль пользователя
    const userRole = (session.user as { role?: string }).role;
    if (!userRole || !["TRAINER", "ADMIN", "MODERATOR"].includes(userRole)) {
      logger.warn("Недостаточно прав для создания шага", {
        userId: session.user.id,
        role: userRole,
      });
      return {
        success: false,
        message: "Недостаточно прав для создания шага",
      };
    }

    // Получаем шаблон
    const template = await prisma.stepTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      logger.warn("Шаблон не найден", { templateId });
      return {
        success: false,
        message: "Шаблон не найден",
      };
    }

    if (!template.isPublic && template.authorId !== session.user.id) {
      logger.warn("Попытка использовать приватный шаблон", {
        templateId,
        userId: session.user.id,
      });
      return {
        success: false,
        message: "Доступ к этому шаблону запрещен",
      };
    }

    // Создаем новый шаг на основе шаблона
    const newStep = await prisma.$transaction(
      async (tx) => {
        // Создаем шаг
        const step = await tx.step.create({
          data: {
            title: template.title,
            description: template.description,
            durationSec: template.durationSec,
            type: template.type,
            imageUrls: template.imageUrls,
            pdfUrls: template.pdfUrls,
            videoUrl: template.videoUrl,
            checklist: template.checklist ?? undefined,
            requiresVideoReport: template.requiresVideoReport,
            requiresWrittenFeedback: template.requiresWrittenFeedback,
            hasTestQuestions: template.hasTestQuestions,
            authorId: session.user!.id,
          },
        });

        // Увеличиваем счетчик использования шаблона
        await tx.stepTemplate.update({
          where: { id: templateId },
          data: {
            usageCount: {
              increment: 1,
            },
          },
        });

        return step;
      },
      {
        maxWait: 5000, // 5 секунд ожидания начала транзакции
        timeout: 10000, // 10 секунд таймаут транзакции (средняя операция)
      },
    );

    logger.info("Шаг успешно создан из шаблона", {
      stepId: newStep.id,
      templateId,
      userId: session.user.id,
    });

    revalidatePath("/main-panel/steps");

    return {
      success: true,
      message: "Шаг успешно создан из шаблона",
      stepId: newStep.id,
    };
  } catch (error) {
    logger.error("Ошибка при создании шага из шаблона", error as Error, { templateId });

    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "action",
        action: "action",
        tags: [],
      },
    );

    return {
      success: false,
      message: "Не удалось создать шаг из шаблона. Попробуйте еще раз.",
    };
  }
}

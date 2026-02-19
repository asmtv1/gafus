"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { createStepFromTemplate as createStepFromTemplateCore } from "@gafus/core/services/trainerStep";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

const logger = createTrainerPanelLogger("trainer-panel-create-step-from-template");

interface CreateStepFromTemplateResult {
  success: boolean;
  message: string;
  stepId?: string;
}

export async function createStepFromTemplate(
  templateId: string,
): Promise<CreateStepFromTemplateResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      logger.warn("Неавторизованная попытка создания шага из шаблона");
      return { success: false, message: "Необходима авторизация" };
    }

    const userRole = (session.user as { role?: string }).role;
    if (!userRole || !["TRAINER", "ADMIN", "MODERATOR"].includes(userRole)) {
      logger.warn("Недостаточно прав для создания шага", {
        userId: session.user.id,
        role: userRole,
      });
      return { success: false, message: "Недостаточно прав для создания шага" };
    }

    const result = await createStepFromTemplateCore({
      templateId,
      authorId: session.user.id,
    });

    if (!result.success) {
      return {
        success: false,
        message: result.error ?? "Не удалось создать шаг из шаблона",
      };
    }

    logger.info("Шаг успешно создан из шаблона", {
      stepId: result.stepId,
      templateId,
      userId: session.user.id,
    });

    revalidatePath("/main-panel/steps");

    return {
      success: true,
      message: "Шаг успешно создан из шаблона",
      stepId: result.stepId,
    };
  } catch (error) {
    logger.error("Ошибка при создании шага из шаблона", error as Error, {
      templateId,
    });
    return {
      success: false,
      message: "Не удалось создать шаг из шаблона. Попробуйте еще раз.",
    };
  }
}

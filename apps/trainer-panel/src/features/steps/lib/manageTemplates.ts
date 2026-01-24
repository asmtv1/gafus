"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

const logger = createTrainerPanelLogger("trainer-panel-manage-templates");

interface TemplateActionResult {
  success: boolean;
  message: string;
}

/**
 * Создает новый шаблон шага
 */
export async function createStepTemplate(
  prevState: TemplateActionResult,
  formData: FormData,
): Promise<TemplateActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, message: "Необходима авторизация" };
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN") {
      return { success: false, message: "Недостаточно прав" };
    }

    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const durationSec = formData.get("durationSec")?.toString();
    const type = formData.get("type")?.toString() || "TRAINING";
    const categoryId = formData.get("categoryId")?.toString() || null;
    const tags = formData.get("tags")?.toString() || "";
    const videoUrl = formData.get("videoUrl")?.toString() || null;

    if (!title || !description) {
      return { success: false, message: "Заполните все обязательные поля" };
    }

    const template = await prisma.stepTemplate.create({
      data: {
        title,
        description,
        durationSec: durationSec ? parseInt(durationSec, 10) : null,
        type: type as "TRAINING" | "EXAMINATION",
        categoryId: categoryId || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        videoUrl,
        authorId: session.user.id,
        isPublic: true,
      },
    });

    logger.info("Шаблон успешно создан", { templateId: template.id });
    revalidatePath("/main-panel/templates");

    return { success: true, message: "Шаблон успешно создан" };
  } catch (error) {
    logger.error("Ошибка при создании шаблона", error as Error);
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "action",
        action: "action",
        tags: [],
      },
    );
    return { success: false, message: "Не удалось создать шаблон" };
  }
}

/**
 * Удаляет шаблон
 */
export async function deleteStepTemplate(templateId: string): Promise<TemplateActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, message: "Необходима авторизация" };
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN") {
      return { success: false, message: "Недостаточно прав" };
    }

    await prisma.stepTemplate.delete({
      where: { id: templateId },
    });

    logger.info("Шаблон успешно удален", { templateId });
    revalidatePath("/main-panel/templates");

    return { success: true, message: "Шаблон успешно удален" };
  } catch (error) {
    logger.error("Ошибка при удалении шаблона", error as Error, { templateId });
    return { success: false, message: "Не удалось удалить шаблон" };
  }
}

/**
 * Создает новую категорию
 */
export async function createStepCategory(
  prevState: TemplateActionResult,
  formData: FormData,
): Promise<TemplateActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, message: "Необходима авторизация" };
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "ADMIN") {
      return { success: false, message: "Недостаточно прав" };
    }

    const name = formData.get("name")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const icon = formData.get("icon")?.toString() || "";
    const order = formData.get("order")?.toString() || "0";

    if (!name) {
      return { success: false, message: "Название обязательно" };
    }

    await prisma.stepCategory.create({
      data: {
        name,
        description: description || null,
        icon: icon || null,
        order: parseInt(order, 10),
      },
    });

    logger.info("Категория успешно создана", { name });
    revalidatePath("/main-panel/templates");

    return { success: true, message: "Категория успешно создана" };
  } catch (error) {
    logger.error("Ошибка при создании категории", error as Error);
    return { success: false, message: "Не удалось создать категорию" };
  }
}

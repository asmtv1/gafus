"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import {
  createStepTemplate as createStepTemplateCore,
  deleteStepTemplate as deleteStepTemplateCore,
  createStepCategory as createStepCategoryCore,
} from "@gafus/core/services/trainerStep";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

const logger = createTrainerPanelLogger("trainer-panel-manage-templates");

interface TemplateActionResult {
  success: boolean;
  message: string;
}

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

    const result = await createStepTemplateCore({
      title,
      description,
      durationSec: durationSec ? parseInt(durationSec, 10) : null,
      type,
      categoryId: categoryId || null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      videoUrl: videoUrl || null,
      authorId: session.user.id,
    });

    if (!result.success) {
      return { success: false, message: result.error ?? "Не удалось создать шаблон" };
    }

    logger.info("Шаблон успешно создан", { templateId: result.templateId });
    revalidatePath("/main-panel/templates");
    return { success: true, message: "Шаблон успешно создан" };
  } catch (error) {
    logger.error("Ошибка при создании шаблона", error as Error);
    return { success: false, message: "Не удалось создать шаблон" };
  }
}

export async function deleteStepTemplate(
  templateId: string,
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

    const result = await deleteStepTemplateCore(templateId);
    if (!result.success) {
      return { success: false, message: result.error ?? "Не удалось удалить шаблон" };
    }

    logger.info("Шаблон успешно удален", { templateId });
    revalidatePath("/main-panel/templates");
    return { success: true, message: "Шаблон успешно удален" };
  } catch (error) {
    logger.error("Ошибка при удалении шаблона", error as Error, { templateId });
    return { success: false, message: "Не удалось удалить шаблон" };
  }
}

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

    const result = await createStepCategoryCore({
      name,
      description: description || null,
      icon: icon || null,
      order: parseInt(order, 10),
    });

    if (!result.success) {
      return {
        success: false,
        message: result.error ?? "Не удалось создать категорию",
      };
    }

    logger.info("Категория успешно создана", { name });
    revalidatePath("/main-panel/templates");
    return { success: true, message: "Категория успешно создана" };
  } catch (error) {
    logger.error("Ошибка при создании категории", error as Error);
    return { success: false, message: "Не удалось создать категорию" };
  }
}

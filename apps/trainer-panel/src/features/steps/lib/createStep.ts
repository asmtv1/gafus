"use server";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { validateForm } from "@shared/lib/validation/serverValidation";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import type { ActionResult } from "@gafus/types";

export async function createStep(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const durationStr = formData.get("duration")?.toString() || "";
    const videoUrl = formData.get("videoUrl")?.toString() || "";

    const imageUrls = formData.getAll("imageUrls").map(String);
    const pdfUrls = formData.getAll("pdfUrls").map(String);

    // Серверная валидация
    const validation = validateForm(
      {
        title,
        description,
        duration: durationStr,
        videoUrl,
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
          if (v.length > 2000) return "Максимум 2000 символов";
          return null;
        },
        duration: (value: unknown) => {
          const v = String(value ?? "");
          if (!v || v.trim().length === 0) return "Длительность обязательна";
          const num = parseInt(v, 10);
          if (isNaN(num)) return "Должно быть числом";
          if (num <= 0) return "Должно быть положительным числом";
          if (num > 1000) return "Максимум 1000 секунд";
          return null;
        },
        videoUrl: (value: unknown) => {
          const v = String(value ?? "");
          if (!v) return null; // Необязательное поле
          const urlPattern =
            /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|rutube\.ru|vimeo\.com)\/.+/;
          return urlPattern.test(v) ? null : "Неверный формат ссылки на видео";
        },
      },
    );

    if (!validation.isValid) {
      return { error: `Ошибка валидации: ${Object.values(validation.errors).join(", ")}` };
    }

    const duration = parseInt(durationStr, 10);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Вы не авторизованы" };
    }
    const authorId = session.user.id;

    const _step = await prisma.step.create({
      data: {
        title,
        description,
        durationSec: duration,
        videoUrl: videoUrl || null,
        imageUrls,
        pdfUrls,
        authorId,
      },
    });

    revalidatePath("/main-panel/steps");

    return { success: true };
  } catch (error) {
    console.error("Ошибка при создании шага:", error);
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: { action: "createStep" },
      tags: ["steps", "create"],
    });
    return { error: "Не удалось создать шаг" };
  }
}

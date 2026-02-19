"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import {
  updateStep as updateStepCore,
  updateStepSchema,
  validateStepFormData,
  hasValidationErrors,
  getValidationErrors,
} from "@gafus/core/services/trainerStep";
import { revalidatePath } from "next/cache";
import {
  deleteFileFromCDN,
  uploadFileToCDN,
  getRelativePathFromCDNUrl,
  getStepImagePath,
} from "@gafus/cdn-upload";
import { randomUUID } from "crypto";
import { invalidateTrainingDaysCache } from "@shared/lib/actions/invalidateTrainingDaysCache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

import type { ActionResult, ChecklistQuestion } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-update-step");

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
    const estimatedDurationMinutesStr =
      formData.get("estimatedDurationMinutes")?.toString() || "";
    const videoUrl = formData.get("videoUrl")?.toString() || "";
    const type = formData.get("type")?.toString() || "TRAINING";
    const checklistStr = formData.get("checklist")?.toString() || "";

    const requiresVideoReport =
      formData.get("requiresVideoReport")?.toString() === "true";
    const requiresWrittenFeedback =
      formData.get("requiresWrittenFeedback")?.toString() === "true";
    const hasTestQuestions =
      formData.get("hasTestQuestions")?.toString() === "true";

    const imageFiles = formData.getAll("images") as File[];
    const deletedImages = formData.getAll("deletedImages").map(String);
    const pdfUrls = formData.getAll("pdfUrls").map(String);

    const validationResult = validateStepFormData({
      title,
      description,
      type,
      duration: durationStr || null,
      videoUrl: videoUrl || null,
      checklist: checklistStr || null,
      hasTestQuestions,
    });

    if (hasValidationErrors(validationResult)) {
      return {
        error: `Ошибка валидации: ${getValidationErrors(validationResult).join(", ")}`,
      };
    }

    if (type === "EXAMINATION") {
      if (!hasTestQuestions && !requiresVideoReport && !requiresWrittenFeedback) {
        return {
          error: "Для экзаменационного шага выберите хотя бы один тип экзамена",
        };
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
      hasTestQuestions && checklistStr
        ? (JSON.parse(checklistStr) as ChecklistQuestion[])
        : null;
    const normalizedChecklist = checklist
      ? checklist.map((q) => ({
          ...q,
          comment:
            typeof q.comment === "string" && q.comment.trim().length > 0
              ? q.comment.trim()
              : undefined,
        }))
      : null;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Вы не авторизованы" };
    }
    const trainerId = session.user.id;

    const existingStep = await prisma.step.findUnique({
      where: { id },
      select: { imageUrls: true },
    });
    const existingImageUrls = existingStep?.imageUrls ?? [];
    const remainingImageUrls = existingImageUrls.filter(
      (url) => !deletedImages.includes(url),
    );

    const newImageUrls: string[] = [];
    if (
      (type === "TRAINING" || type === "THEORY" || type === "PRACTICE") &&
      imageFiles.length > 0
    ) {
      try {
        for (const file of imageFiles) {
          const ext = file.name.split(".").pop() || "jpg";
          const relativePath = getStepImagePath(
            trainerId,
            id,
            randomUUID(),
            ext,
          );
          const fileUrl = await uploadFileToCDN(file, relativePath);
          newImageUrls.push(fileUrl);
        }
      } catch (error) {
        logger.error("Ошибка загрузки новых изображений в CDN", error as Error);
        return { error: "Не удалось загрузить новые изображения" };
      }
    }

    if (deletedImages.length > 0) {
      for (const imageUrl of deletedImages) {
        try {
          const relativePath = getRelativePathFromCDNUrl(imageUrl);
          await deleteFileFromCDN(relativePath);
        } catch (err) {
          logger.error("Ошибка удаления изображения из CDN", err as Error);
        }
      }
    }

    const imageUrls =
      type === "TRAINING" || type === "THEORY" || type === "PRACTICE"
        ? [...remainingImageUrls, ...newImageUrls]
        : [];

    const payload = {
      id,
      title: title.trim(),
      description: description.trim(),
      type,
      durationSec: duration,
      estimatedDurationSec: estimatedDurationSec ?? null,
      videoUrl: videoUrl || null,
      imageUrls,
      pdfUrls:
        type === "TRAINING" || type === "THEORY" || type === "PRACTICE"
          ? pdfUrls
          : [],
      checklist:
        hasTestQuestions && normalizedChecklist && normalizedChecklist.length > 0
          ? normalizedChecklist
          : undefined,
      requiresVideoReport: type === "EXAMINATION" ? requiresVideoReport : false,
      requiresWrittenFeedback:
        type === "EXAMINATION" ? requiresWrittenFeedback : false,
      hasTestQuestions: type === "EXAMINATION" ? hasTestQuestions : false,
    };

    const parsed = updateStepSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        error: `Ошибка валидации: ${parsed.error.flatten().formErrors.join(", ")}`,
      };
    }

    const result = await updateStepCore(parsed.data);
    if (!result.success) {
      return { error: result.error ?? "Не удалось обновить шаг" };
    }

    revalidatePath("/main-panel/steps");
    await invalidateTrainingDaysCache();
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении шага", error as Error, {
      operation: "updateStep",
    });
    return {
      error: error instanceof Error ? error.message : "Не удалось обновить шаг",
    };
  }
}

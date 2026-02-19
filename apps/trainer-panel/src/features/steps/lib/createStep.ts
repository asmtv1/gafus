"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { authOptions } from "@gafus/auth";
import {
  createStep as createStepCore,
  createStepSchema,
  validateStepFormData,
  hasValidationErrors,
  getValidationErrors,
} from "@gafus/core/services/trainerStep";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import {
  uploadFileToCDN,
  deleteFileFromCDN,
  getRelativePathFromCDNUrl,
  getStepImagePath,
} from "@gafus/cdn-upload";
import { randomUUID } from "crypto";

import type { ActionResult, ChecklistQuestion } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-create-step");

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

    const requiresVideoReport =
      formData.get("requiresVideoReport")?.toString() === "true";
    const requiresWrittenFeedback =
      formData.get("requiresWrittenFeedback")?.toString() === "true";
    const hasTestQuestions =
      formData.get("hasTestQuestions")?.toString() === "true";

    const imageFiles = formData.getAll("images") as File[];
    const deletedImages = formData.getAll("deletedImages").map(String);
    const pdfUrls = formData.getAll("pdfUrls").map(String);

    logger.info("Создание шага", {
      operation: "create_step_start",
      title,
      type,
      imageFilesCount: imageFiles.length,
      pdfUrlsCount: pdfUrls.length,
    });

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
      type === "EXAMINATION" && checklistStr
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
    const stepId = randomUUID();

    // Удаление помеченных изображений из CDN (до создания шага)
    if (
      (type === "TRAINING" || type === "THEORY" || type === "PRACTICE") &&
      deletedImages.length > 0
    ) {
      for (const imageUrl of deletedImages) {
        try {
          const relativePath = getRelativePathFromCDNUrl(imageUrl);
          await deleteFileFromCDN(relativePath);
        } catch (err) {
          logger.error("Ошибка удаления изображения из CDN", err as Error);
        }
      }
    }

    // Загрузка изображений в CDN с путём, содержащим stepId (UUID)
    const imageUrls: string[] = [];
    if (
      (type === "TRAINING" || type === "THEORY" || type === "PRACTICE") &&
      imageFiles.length > 0
    ) {
      try {
        for (const file of imageFiles) {
          const ext = file.name.split(".").pop() || "jpg";
          const relativePath = getStepImagePath(
            trainerId,
            stepId,
            randomUUID(),
            ext,
          );
          const fileUrl = await uploadFileToCDN(file, relativePath);
          imageUrls.push(fileUrl);
        }
      } catch (error) {
        logger.error("Ошибка загрузки изображений в CDN", error as Error);
        return { error: "Не удалось загрузить изображения" };
      }
    }

    const payload = {
      id: stepId,
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

    const parsed = createStepSchema.safeParse(payload);
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join(", ");
      if (imageUrls.length > 0) {
        for (const url of imageUrls) {
          try {
            await deleteFileFromCDN(getRelativePathFromCDNUrl(url));
          } catch {
            // ignore
          }
        }
      }
      return { error: `Ошибка валидации: ${msg}` };
    }

    const result = await createStepCore(parsed.data, trainerId);

    if (!result.success) {
      for (const url of imageUrls) {
        try {
          await deleteFileFromCDN(getRelativePathFromCDNUrl(url));
        } catch {
          // ignore rollback errors
        }
      }
      return { error: result.error ?? "Не удалось создать шаг" };
    }

    revalidatePath("/main-panel/steps");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при создании шага", error as Error, {
      operation: "createStep",
    });
    return {
      error: error instanceof Error ? error.message : "Не удалось создать шаг",
    };
  }
}

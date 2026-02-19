"use server";

import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";

import {
  deleteFileFromCDN,
  getCourseImagePath,
  getRelativePathFromCDNUrl,
  uploadFileToCDN,
} from "@gafus/cdn-upload";
import { authOptions } from "@gafus/auth";
import { updateCourseLogoUrl } from "@gafus/core/services/course";
import { validateImageUpload } from "@gafus/core/services/common";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("trainer-panel-upload-course-image");

export async function uploadCourseImageServerAction(formData: FormData, courseId?: string) {
  let file: File | null = null;

  try {
    file = formData.get("image") as File | null;

    if (!file || file.size === 0) {
      throw new Error("Файл не получен или пуст");
    }

    const validation = validateImageUpload(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error("Не авторизован");
    }
    const trainerId = session.user.id;

    if (!courseId) {
      throw new Error("courseId обязателен для редактирования");
    }

    const ext = file.name.split(".").pop() || "jpg";
    const uuid = randomUUID();
    const relativePath = getCourseImagePath(trainerId, courseId, uuid, ext);

    const fileUrl = await uploadFileToCDN(file, relativePath);

    const result = await updateCourseLogoUrl(courseId, fileUrl);
    if (!result.success) {
      try {
        const newRelativePath = getRelativePathFromCDNUrl(fileUrl);
        await deleteFileFromCDN(newRelativePath);
      } catch {
        // игнорируем ошибку отката CDN
      }
      throw new Error(result.error);
    }

    if (result.previousLogoUrl) {
      const oldRelativePath = getRelativePathFromCDNUrl(result.previousLogoUrl);
      try {
        await deleteFileFromCDN(oldRelativePath);
        logger.info("Старое изображение курса удалено из CDN", {
          path: oldRelativePath,
        });
      } catch (error) {
        logger.error("Не удалось удалить старое изображение курса из CDN", error as Error);
      }
    }

    return fileUrl;
  } catch (error) {
    logger.error("Ошибка загрузки изображения курса", error as Error, {
      operation: "upload_course_image_error",
      fileName: file?.name,
      fileSize: file?.size,
    });

    if (file) {
      logger.error(
        error instanceof Error ? error.message : "Unknown error",
        error instanceof Error ? error : new Error(String(error)),
        { operation: "action", action: "action", tags: [] },
      );
    }

    throw error;
  }
}

"use server";

import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { updateAvatar as updateAvatarCore } from "@gafus/core/services/user";

const logger = createWebLogger("web-update-avatar");

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 МБ
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

function validateAvatarFile(file: File): void {
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("Файл слишком большой. Максимальный размер аватара — 5 МБ.");
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error(
      "Недопустимый тип файла. Разрешены: JPEG, PNG, WebP, GIF.",
    );
  }
}

export async function updateAvatar(file: File): Promise<string> {
  const validFile = fileSchema.parse(file);
  validateAvatarFile(validFile);
  try {
    const userId = await getCurrentUserId();
    return await updateAvatarCore(userId, validFile);
  } catch (error) {
    logger.error("Ошибка в updateAvatar", error as Error, { operation: "error" });
    throw new Error("Ошибка при обновлении аватара. Попробуйте перезагрузить страницу.");
  }
}

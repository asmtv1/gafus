"use server";

import { z } from "zod";

import { updatePetPhoto } from "@gafus/core/services/pets";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { petIdSchema } from "../validation/petSchemas";

const MAX_PET_AVATAR_SIZE = 2 * 1024 * 1024; // 2 МБ
const ALLOWED_PET_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

function validatePetAvatarFile(file: File): void {
  if (file.size > MAX_PET_AVATAR_SIZE) {
    throw new Error("Файл слишком большой. Максимальный размер фото питомца — 2 МБ.");
  }
  if (!ALLOWED_PET_AVATAR_TYPES.includes(file.type)) {
    throw new Error(
      "Недопустимый тип файла. Разрешены: JPEG, PNG, WebP, GIF.",
    );
  }
}

/**
 * Обновляет фото питомца. Переиспользует логику из @gafus/core (updatePetPhoto).
 * Валидация и получение текущего пользователя — в web; загрузка в CDN и обновление БД — в core.
 */
export async function updatePetAvatar(file: File, petId: string): Promise<string> {
  const validFile = fileSchema.parse(file);
  validatePetAvatarFile(validFile);
  const safePetId = petIdSchema.parse(petId);

  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Не авторизован");
  }

  return updatePetPhoto(safePetId, userId, validFile);
}

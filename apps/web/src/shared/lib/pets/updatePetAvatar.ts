"use server";

import { z } from "zod";

import { updatePetPhoto } from "@gafus/core/services/pets";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { petIdSchema } from "../validation/petSchemas";

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

/**
 * Обновляет фото питомца. Переиспользует логику из @gafus/core (updatePetPhoto).
 * Валидация и получение текущего пользователя — в web; загрузка в CDN и обновление БД — в core.
 */
export async function updatePetAvatar(file: File, petId: string): Promise<string> {
  const validFile = fileSchema.parse(file);
  const safePetId = petIdSchema.parse(petId);

  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Не авторизован");
  }

  return updatePetPhoto(safePetId, userId, validFile);
}

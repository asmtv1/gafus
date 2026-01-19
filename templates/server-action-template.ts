/**
 * ШАБЛОН ДЛЯ СОЗДАНИЯ SERVER ACTION
 *
 * Server Actions - тонкие обертки для Web приложения.
 * Содержат: "use server", валидация через Zod, вызов services
 * НЕ содержат: бизнес-логику, прямые запросы к Prisma
 */

"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { ValidationError, AuthorizationError, NotFoundError, ConflictError } from "@shared/errors";

// Импорт из соответствующего service
import {
  createEntity,
  getEntity,
  getUserEntities,
  updateEntity,
  deleteEntity,
  type CreateEntityData,
  type UpdateEntityData,
  type EntityData
} from "@shared/services/entity/entityService";

const logger = createWebLogger('entity-actions');

// Схемы валидации
const createEntitySchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100, "Максимум 100 символов"),
  // ... другие поля
});

const updateEntitySchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100, "Максимум 100 символов").optional(),
  // ... другие поля
});

/**
 * Создает новую сущность
 * @param formData - Данные формы
 * @returns Результат операции
 */
export async function createEntityAction(formData: FormData) {
  try {
    // Получаем пользователя
    const userId = await getCurrentUserId();

    // Преобразуем FormData и валидируем
    const rawData = Object.fromEntries(formData);
    const data = createEntitySchema.parse(rawData);

    // Вызываем service
    const result = await createEntity(userId, data);

    // Инвалидируем кэш
    revalidateTag(`user-${userId}`);
    revalidatePath("/entities");

    return { success: true, data: result };
  } catch (error) {
    logger.error("createEntityAction failed", error as Error);

    // Преобразование ошибок в пользовательские сообщения
    if (error instanceof ValidationError) {
      return { success: false, error: error.message, fields: error.fields };
    }
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }
    if (error instanceof ConflictError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Не удалось создать сущность" };
  }
}

/**
 * Получает сущность по ID
 * @param entityId - ID сущности
 * @returns Сущность или null
 */
export async function getEntityAction(entityId: string) {
  try {
    const userId = await getCurrentUserId();
    const entity = await getEntity(userId, entityId);

    return { success: true, data: entity };
  } catch (error) {
    logger.error("getEntityAction failed", error as Error, { entityId });

    if (error instanceof NotFoundError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Не удалось получить сущность" };
  }
}

/**
 * Получает все сущности пользователя (с кэшированием)
 * @returns Массив сущностей
 */
export async function getUserEntitiesAction() {
  try {
    const userId = await getCurrentUserId();

    // Кэширование с userId в ключе и тегах
    const entities = await getCachedUserEntities(userId);

    return { success: true, data: entities };
  } catch (error) {
    logger.error("getUserEntitiesAction failed", error as Error);

    return { success: false, error: "Не удалось получить список сущностей" };
  }
}

/**
 * Обновляет сущность
 * @param formData - Данные формы (включая entityId)
 * @returns Результат операции
 */
export async function updateEntityAction(formData: FormData) {
  try {
    const userId = await getCurrentUserId();

    // Извлекаем entityId отдельно
    const entityId = formData.get("entityId") as string;
    if (!entityId) {
      return { success: false, error: "ID сущности обязателен" };
    }

    // Преобразуем остальные данные и валидируем
    const rawData = Object.fromEntries(formData);
    delete rawData.entityId; // Убираем entityId из данных

    const data = updateEntitySchema.parse(rawData);

    // Вызываем service
    const result = await updateEntity(userId, entityId, data);

    // Инвалидируем кэш
    revalidateTag(`user-${userId}`);
    revalidateTag(`entity-${entityId}`);
    revalidatePath("/entities");

    return { success: true, data: result };
  } catch (error) {
    logger.error("updateEntityAction failed", error as Error, { entityId });

    if (error instanceof ValidationError) {
      return { success: false, error: error.message, fields: error.fields };
    }
    if (error instanceof NotFoundError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Не удалось обновить сущность" };
  }
}

/**
 * Удаляет сущность
 * @param entityId - ID сущности
 * @returns Результат операции
 */
export async function deleteEntityAction(entityId: string) {
  try {
    const userId = await getCurrentUserId();

    await deleteEntity(userId, entityId);

    // Инвалидируем кэш
    revalidateTag(`user-${userId}`);
    revalidateTag(`entity-${entityId}`);
    revalidatePath("/entities");

    return { success: true };
  } catch (error) {
    logger.error("deleteEntityAction failed", error as Error, { entityId });

    if (error instanceof NotFoundError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Не удалось удалить сущность" };
  }
}

// Кэшированные версии (если нужны)
import { unstable_cache } from "next/cache";

function getCachedUserEntities(userId: string) {
  return unstable_cache(
    async () => getUserEntities(userId),
    ["user-entities", userId],
    {
      tags: [`user-${userId}`, "entities"],
    }
  );
}
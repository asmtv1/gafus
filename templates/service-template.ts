/**
 * ШАБЛОН ДЛЯ СОЗДАНИЯ SERVICE
 *
 * Services содержат чистую бизнес-логику без Next.js специфики.
 * НЕ использовать: unstable_cache, revalidateTag, "use server", FormData
 * Использовать: handlePrismaError, ServiceError, типизированные ошибки
 */

import { prisma } from "@gafus/prisma";
import { handlePrismaError, ValidationError, NotFoundError } from "@shared/errors";

export interface CreateEntityData {
  name: string;
  // ... другие поля
}

export interface UpdateEntityData {
  name?: string;
  // ... другие поля
}

export interface EntityData {
  id: string;
  name: string;
  // ... другие поля
}

/**
 * Создает новую сущность
 * @param userId - ID пользователя
 * @param data - Данные для создания
 * @returns Созданная сущность
 * @throws ValidationError, ConflictError
 */
export async function createEntity(userId: string, data: CreateEntityData): Promise<EntityData> {
  try {
    // Бизнес-валидация
    if (!data.name?.trim()) {
      throw new ValidationError("Название обязательно");
    }

    // Создание записи
    const entity = await prisma.entity.create({
      data: {
        ...data,
        userId,
        createdAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        // ... другие поля
      },
    });

    return entity;
  } catch (error) {
    // Преобразование Prisma ошибок
    if (error instanceof ValidationError) {
      throw error;
    }
    handlePrismaError(error, "Сущность");
  }
}

/**
 * Получает сущность по ID
 * @param userId - ID пользователя
 * @param entityId - ID сущности
 * @returns Сущность или null
 * @throws NotFoundError
 */
export async function getEntity(userId: string, entityId: string): Promise<EntityData | null> {
  try {
    const entity = await prisma.entity.findFirst({
      where: {
        id: entityId,
        userId, // Проверка доступа
      },
      select: {
        id: true,
        name: true,
        // ... другие поля
      },
    });

    return entity;
  } catch (error) {
    handlePrismaError(error, "Сущность");
  }
}

/**
 * Получает все сущности пользователя
 * @param userId - ID пользователя
 * @returns Массив сущностей
 */
export async function getUserEntities(userId: string): Promise<EntityData[]> {
  try {
    const entities = await prisma.entity.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        // ... другие поля
      },
      orderBy: { createdAt: "desc" },
    });

    return entities;
  } catch (error) {
    handlePrismaError(error, "Сущность");
  }
}

/**
 * Обновляет сущность
 * @param userId - ID пользователя
 * @param entityId - ID сущности
 * @param data - Данные для обновления
 * @returns Обновленная сущность
 * @throws ValidationError, NotFoundError
 */
export async function updateEntity(
  userId: string,
  entityId: string,
  data: UpdateEntityData,
): Promise<EntityData> {
  try {
    // Бизнес-валидация
    if (data.name !== undefined && !data.name?.trim()) {
      throw new ValidationError("Название не может быть пустым");
    }

    // Проверка существования и доступа
    const existing = await prisma.entity.findFirst({
      where: {
        id: entityId,
        userId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Сущность", entityId);
    }

    // Обновление
    const updatedEntity = await prisma.entity.update({
      where: { id: entityId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        // ... другие поля
      },
    });

    return updatedEntity;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    handlePrismaError(error, "Сущность");
  }
}

/**
 * Удаляет сущность
 * @param userId - ID пользователя
 * @param entityId - ID сущности
 * @throws NotFoundError
 */
export async function deleteEntity(userId: string, entityId: string): Promise<void> {
  try {
    // Проверка существования и доступа
    const existing = await prisma.entity.findFirst({
      where: {
        id: entityId,
        userId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Сущность", entityId);
    }

    // Удаление
    await prisma.entity.delete({
      where: { id: entityId },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    handlePrismaError(error, "Сущность");
  }
}

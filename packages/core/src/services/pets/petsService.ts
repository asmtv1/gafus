/**
 * Pets Service
 * Сервис для работы с питомцами
 */
import { prisma } from "@gafus/prisma";
import { deleteFileFromCDN, getRelativePathFromCDNUrl } from "@gafus/cdn-upload";
import { createWebLogger } from "@gafus/logger";

import type { PetType, Prisma } from "@gafus/prisma";

const logger = createWebLogger("core-pets");

export interface CreatePetInput {
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}

export interface UpdatePetInput {
  name?: string;
  type?: string;
  breed?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  photoUrl?: string;
  notes?: string;
}

/**
 * Получить список питомцев пользователя
 */
export async function getUserPets(userId: string) {
  try {
    const pets = await prisma.pet.findMany({
      where: { ownerId: userId },
      include: {
        awards: {
          orderBy: { date: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return pets;
  } catch (error) {
    logger.error("Ошибка при получении питомцев", error as Error);
    return [];
  }
}

/**
 * Получить питомца по ID
 */
export async function getPetById(petId: string, userId: string) {
  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
    include: {
      awards: {
        orderBy: { date: "desc" },
      },
    },
  });

  return pet;
}

/**
 * Создать питомца
 */
export async function createPet(userId: string, data: CreatePetInput) {
  try {
    const pet = await prisma.pet.create({
      data: {
        ownerId: userId,
        name: data.name,
        type: data.type as PetType,
        breed: data.breed,
        birthDate: new Date(data.birthDate),
        heightCm: data.heightCm ?? null,
        weightKg: data.weightKg ?? null,
        photoUrl: data.photoUrl || null,
        notes: data.notes ?? null,
      },
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    logger.error("Ошибка при создании питомца", error as Error);
    throw new Error("Не удалось создать питомца");
  }
}

/**
 * Обновить питомца
 */
export async function updatePet(petId: string, userId: string, data: UpdatePetInput) {
  // Проверяем, что питомец принадлежит пользователю
  const existingPet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
  });

  if (!existingPet) {
    return null;
  }

  const updateData: Prisma.PetUpdateInput = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.type !== undefined) updateData.type = data.type as PetType;
  if (data.breed !== undefined) updateData.breed = data.breed;
  if (data.birthDate !== undefined) updateData.birthDate = new Date(data.birthDate);
  if (data.heightCm !== undefined) updateData.heightCm = data.heightCm ?? null;
  if (data.weightKg !== undefined) updateData.weightKg = data.weightKg ?? null;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl || null;
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;

  try {
    const pet = await prisma.pet.update({
      where: { id: petId },
      data: updateData,
      include: {
        awards: true,
      },
    });

    return pet;
  } catch (error) {
    logger.error("Ошибка при обновлении питомца", error as Error);
    throw new Error("Не удалось обновить питомца");
  }
}

/**
 * Удалить питомца
 */
export async function deletePet(petId: string, userId: string): Promise<boolean> {
  // Проверяем, что питомец принадлежит пользователю
  const existingPet = await prisma.pet.findFirst({
    where: {
      id: petId,
      ownerId: userId,
    },
    select: { photoUrl: true },
  });

  if (!existingPet) {
    return false;
  }

  // Удаляем фото из CDN, если есть
  if (existingPet.photoUrl) {
    try {
      const relativePath = getRelativePathFromCDNUrl(existingPet.photoUrl);
      await deleteFileFromCDN(relativePath);
      logger.info(`Photo deleted from CDN: ${relativePath}`);
    } catch (error) {
      logger.error("Failed to delete photo from CDN", error as Error);
      // Продолжаем удаление питомца даже если фото не удалилось
    }
  }

  try {
    await prisma.pet.delete({
      where: { id: petId },
    });
    return true;
  } catch (error) {
    logger.error("Ошибка при удалении питомца", error as Error);
    throw new Error("Не удалось удалить питомца");
  }
}

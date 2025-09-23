"use server";
import { prisma } from "@gafus/prisma";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для getUserPet
const logger = createWebLogger('web-get-user-pet');

const ownerIdSchema = z.string().trim().min(1, "Не удалось получить профиль пользователя");

export async function getUserPet(ownerId: string | null) {
  const safeOwnerId = ownerIdSchema.parse(ownerId);

  try {
    const pets = await prisma.pet.findMany({
      where: { ownerId: safeOwnerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ownerId: true,
        name: true,
        type: true,
        breed: true,
        birthDate: true,
        heightCm: true,
        weightKg: true,
        photoUrl: true,
        notes: true,
        awards: {
          orderBy: { date: "desc" },
          select: {
            id: true,
            title: true,
            event: true,
            date: true,
            rank: true,
          },
        },
      },
    });

    return pets;
  } catch (error) {
    logger.error("Ошибка в getUserPet:", error as Error, { operation: 'error' });
    throw new Error("Не удалось получить питомцев пользователя");
  }
}

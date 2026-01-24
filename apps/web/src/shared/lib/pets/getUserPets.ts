"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";

// Создаем логгер для getUserPets
const logger = createWebLogger("web-get-user-pets");

export async function getUserPets() {
  try {
    // Используем auth напрямую - возвращает null для неавторизованных без выброса ошибки
    const userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      // Возвращаем пустой список вместо ошибки, если пользователь не авторизован
      return [];
    }

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
    logger.error("Ошибка при получении питомцев:", error as Error, { operation: "error" });
    // Безопасно возвращаем пустой список для неавторизованных/ошибочных кейсов,
    // чтобы не ломать страницы до логина
    return [];
  }
}

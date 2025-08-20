"use server";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

export async function getUserPets() {
  try {
    const userId = await getCurrentUserId();
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
    console.error("Ошибка при получении питомцев:", error);
    // Безопасно возвращаем пустой список для неавторизованных/ошибочных кейсов,
    // чтобы не ломать страницы до логина
    return [];
  }
}

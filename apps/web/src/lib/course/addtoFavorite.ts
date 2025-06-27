"use server";

import { prisma } from "@prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function toggleFavoriteCourse(courseId: number): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();

    const existing = await prisma.favoriteCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (existing) {
      await prisma.favoriteCourse.delete({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      });
      return false; // теперь не в избранном
    } else {
      await prisma.favoriteCourse.create({
        data: {
          userId,
          courseId,
        },
      });
      return true; // теперь в избранном
    }
  } catch (error) {
    console.error("Ошибка в toggleFavoriteCourse:", error);
    throw new Error(
      "Ошибка при добавлении в избранное. Попробуйте перезагрузить страницу."
    );
  }
}

"use server";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

export async function toggleFavoriteCourse(courseId: string): Promise<boolean> {
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
      return false; // больше не в избранном
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
    throw new Error("Ошибка при изменении избранного курса. Попробуйте перезагрузить страницу.");
  }
}

"use server";

import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

/**
 * Получает количество экзаменов, ожидающих проверки тренером
 * @returns Количество непроверенных экзаменов
 */
export async function getPendingExamCount(): Promise<number> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return 0;
  }

  // Проверяем роль пользователя
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    return 0;
  }

  try {
    // Подсчитываем экзамены со статусом IN_PROGRESS для курсов тренера
    const count = await prisma.examResult.count({
      where: {
        userStep: {
          status: "IN_PROGRESS",
          userTraining: {
            dayOnCourse: {
              course: {
                // Если не админ, то только свои курсы
                ...(session.user.role !== "ADMIN" && {
                  authorId: session.user.id
                })
              }
            }
          }
        }
      }
    });

    return count;
  } catch (error) {
    console.error("Ошибка при подсчёте непроверенных экзаменов:", error);
    return 0;
  }
}




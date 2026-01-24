"use server";

import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

export interface PendingExamResult {
  id: string;
  userStepId: string;
  stepTitle: string;
  studentUsername: string;
  courseName: string;
  dayTitle: string;
  hasTestQuestions: boolean;
  hasWrittenFeedback: boolean;
  hasVideoReport: boolean;
  testAnswers: Record<string, number> | null;
  testScore: number | null;
  testMaxScore: number | null;
  writtenFeedback: string | null;
  videoReportUrl: string | null;
  submittedAt: Date;
}

/**
 * Получает список экзаменов, ожидающих проверки тренером
 */
export async function getPendingExamResults(): Promise<PendingExamResult[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Не авторизован");
  }

  // Проверяем роль пользователя
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    throw new Error("Недостаточно прав доступа");
  }

  try {
    // Получаем все экзамены со статусом IN_PROGRESS для курсов тренера
    const examResults = await prisma.examResult.findMany({
      where: {
        userStep: {
          status: "IN_PROGRESS",
          userTraining: {
            dayOnCourse: {
              course: {
                // Если не админ, то только свои курсы
                ...(session.user.role !== "ADMIN" && {
                  authorId: session.user.id,
                }),
              },
            },
          },
        },
      },
      include: {
        userStep: {
          include: {
            userTraining: {
              include: {
                user: {
                  select: {
                    username: true,
                  },
                },
                dayOnCourse: {
                  include: {
                    course: {
                      select: {
                        name: true,
                      },
                    },
                    day: {
                      select: {
                        title: true,
                      },
                    },
                  },
                },
              },
            },
            stepOnDay: {
              include: {
                step: {
                  select: {
                    title: true,
                    hasTestQuestions: true,
                    requiresWrittenFeedback: true,
                    requiresVideoReport: true,
                    checklist: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Преобразуем в нужный формат
    return examResults.map((result) => {
      // Парсим testAnswers
      let testAnswers: Record<string, number> | null = null;
      if (result.testAnswers) {
        try {
          testAnswers =
            typeof result.testAnswers === "string"
              ? JSON.parse(result.testAnswers)
              : (result.testAnswers as Record<string, number>);
        } catch (e) {
          console.error("Ошибка парсинга testAnswers:", e);
        }
      }

      return {
        id: result.id,
        userStepId: result.userStepId,
        stepTitle: result.userStep.stepOnDay.step.title,
        studentUsername: result.userStep.userTraining.user.username,
        courseName: result.userStep.userTraining.dayOnCourse.course.name,
        dayTitle: result.userStep.userTraining.dayOnCourse.day.title,
        hasTestQuestions: result.userStep.stepOnDay.step.hasTestQuestions,
        hasWrittenFeedback: result.userStep.stepOnDay.step.requiresWrittenFeedback,
        hasVideoReport: result.userStep.stepOnDay.step.requiresVideoReport,
        testAnswers,
        testScore: result.testScore,
        testMaxScore: result.testMaxScore,
        writtenFeedback: result.writtenFeedback,
        videoReportUrl: result.videoReportUrl,
        submittedAt: result.createdAt,
      };
    });
  } catch (error) {
    console.error("Ошибка при получении экзаменов на проверку:", error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}

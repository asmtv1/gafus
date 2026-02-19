/**
 * Exam Service
 * Сервис для работы с экзаменами
 */
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";

const logger = createWebLogger("core-exam");

/** Действие проверки экзамена: утвердить или отклонить */
export type ExamReviewAction = "approve" | "reject";

/** Входные данные для проверки результата экзамена тренером */
export interface ReviewExamResultData {
  userStepId: string;
  action: ExamReviewAction;
  trainerComment?: string | null;
}

/** Экзамен, ожидающий проверки (для списка тренера) */
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

/** Опции для getExamResults */
export interface GetExamResultsOptions {
  hideCompleted?: boolean;
}

/** Результат экзамена с полными деталями для списка тренера */
export interface ExamResultWithDetails {
  id: string;
  testAnswers: unknown;
  testScore: number | null;
  testMaxScore: number | null;
  videoReportUrl: string | null;
  writtenFeedback: string | null;
  overallScore: number | null;
  isPassed: boolean | null;
  trainerComment: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewedBy: {
    id: string;
    username: string;
    profile: {
      fullName: string | null;
      avatarUrl: string | null;
    } | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  userStep: {
    id: string;
    status: string;
    userTraining: {
      id: string;
      user: {
        id: string;
        username: string;
        profile: {
          fullName: string | null;
          avatarUrl: string | null;
        } | null;
      };
      dayOnCourse: {
        id: string;
        day: {
          id: string;
          title: string;
        };
        course: {
          id: string;
          name: string;
          type: string;
        };
      };
    };
    stepOnDay: {
      id: string;
      order: number;
      step: {
        id: string;
        title: string;
        type: string;
        hasTestQuestions: boolean;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        checklist: unknown;
      };
    };
  };
}

export interface ExamResultData {
  id: string;
  testAnswers: Record<string, number> | null;
  testScore: number | null;
  testMaxScore: number | null;
  videoReportUrl: string | null;
  writtenFeedback: string | null;
  overallScore: number | null;
  isPassed: boolean | null;
  trainerComment: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewedBy: {
    username: string;
    profile: {
      fullName: string | null;
    } | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamSubmissionData {
  userStepId: string;
  stepId: string;
  testAnswers?: Record<string, number>;
  testScore?: number;
  testMaxScore?: number;
  videoReportUrl?: string;
  writtenFeedback?: string;
  overallScore?: number;
  isPassed?: boolean;
}

/**
 * Получает результат экзамена для конкретного userStepId
 */
export async function getExamResult(
  userId: string,
  userStepId: string,
): Promise<ExamResultData | null> {
  try {
    // Проверяем, что userStep принадлежит пользователю
    const userStep = await prisma.userStep.findFirst({
      where: {
        id: userStepId,
        userTraining: {
          userId,
        },
      },
    });

    if (!userStep) {
      return null;
    }

    // Получаем результат экзамена
    const examResult = await prisma.examResult.findUnique({
      where: {
        userStepId,
      },
      select: {
        id: true,
        testAnswers: true,
        testScore: true,
        testMaxScore: true,
        videoReportUrl: true,
        writtenFeedback: true,
        overallScore: true,
        isPassed: true,
        trainerComment: true,
        reviewedAt: true,
        reviewedById: true,
        reviewedBy: {
          select: {
            username: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!examResult) {
      return null;
    }

    // Парсим testAnswers из JSON если есть
    let testAnswers: Record<string, number> | null = null;
    if (examResult.testAnswers) {
      try {
        testAnswers =
          typeof examResult.testAnswers === "string"
            ? JSON.parse(examResult.testAnswers)
            : (examResult.testAnswers as Record<string, number>);
      } catch (e) {
        logger.error("Ошибка парсинга testAnswers", e as Error);
      }
    }

    return {
      ...examResult,
      testAnswers,
    };
  } catch (error) {
    logger.error("Ошибка при получении результата экзамена", error as Error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}

/**
 * Сохраняет результат экзамена
 */
export async function submitExamResult(
  userId: string,
  data: ExamSubmissionData,
): Promise<{ success: boolean; examResultId: string }> {
  try {
    // Проверяем, что userStep принадлежит пользователю
    const userStep = await prisma.userStep.findFirst({
      where: {
        id: data.userStepId,
        userTraining: {
          userId,
        },
      },
      include: {
        stepOnDay: {
          include: {
            step: true,
          },
        },
      },
    });

    if (!userStep) {
      throw new Error("Шаг не найден или нет доступа");
    }

    // Проверяем, что это экзаменационный шаг
    if (userStep.stepOnDay.step.type !== "EXAMINATION") {
      throw new Error(
        `Этот шаг не является экзаменационным. Тип шага: ${userStep.stepOnDay.step.type || "не определен"}`,
      );
    }

    // Создаем или обновляем результат экзамена
    const updateData: Partial<{
      testAnswers: string;
      testScore: number;
      testMaxScore: number;
      videoReportUrl: string;
      writtenFeedback: string;
      overallScore: number;
      isPassed: boolean;
      trainerComment: string | null;
      reviewedAt: Date | null;
      reviewedById: string | null;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    // Добавляем в updateData только те поля, которые были переданы
    if (data.testAnswers !== undefined) {
      updateData.testAnswers = JSON.stringify(data.testAnswers);
    }
    if (data.testScore !== undefined) {
      updateData.testScore = data.testScore;
    }
    if (data.testMaxScore !== undefined) {
      updateData.testMaxScore = data.testMaxScore;
    }
    if (data.videoReportUrl !== undefined) {
      updateData.videoReportUrl = data.videoReportUrl;
    }
    if (data.writtenFeedback !== undefined) {
      updateData.writtenFeedback = data.writtenFeedback;
    }
    if (data.overallScore !== undefined) {
      updateData.overallScore = data.overallScore;
    }
    if (data.isPassed !== undefined) {
      updateData.isPassed = data.isPassed;
    }

    // Сбрасываем результат проверки тренером при повторной отправке
    updateData.trainerComment = null;
    updateData.reviewedAt = null;
    updateData.reviewedById = null;

    const examResult = await prisma.examResult.upsert({
      where: {
        userStepId: data.userStepId,
      },
      update: updateData,
      create: {
        userStepId: data.userStepId,
        stepId: data.stepId,
        testAnswers: data.testAnswers ? JSON.stringify(data.testAnswers) : undefined,
        testScore: data.testScore || null,
        testMaxScore: data.testMaxScore || null,
        videoReportUrl: data.videoReportUrl || null,
        writtenFeedback: data.writtenFeedback || null,
        overallScore: data.overallScore || null,
        isPassed: data.isPassed || null,
      },
    });

    // Обновляем статус шага на IN_PROGRESS
    await prisma.userStep.update({
      where: {
        id: data.userStepId,
      },
      data: {
        status: "IN_PROGRESS",
      },
    });

    return { success: true, examResultId: examResult.id };
  } catch (error) {
    logger.error("Ошибка при сохранении результата экзамена", error as Error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}

const ALLOWED_REVIEWER_ROLES = ["TRAINER", "ADMIN", "MODERATOR"] as const;

/**
 * Проверка и утверждение/отклонение результата экзамена тренером.
 * Обновляет UserStep и ExamResult в одной транзакции, затем отправляет пуш-уведомление.
 */
export async function reviewExamResult(
  reviewerId: string,
  reviewerRole: string,
  data: ReviewExamResultData,
): Promise<ActionResult> {
  try {
    if (!ALLOWED_REVIEWER_ROLES.includes(reviewerRole as (typeof ALLOWED_REVIEWER_ROLES)[number])) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    const userStep = await prisma.userStep.findUnique({
      where: { id: data.userStepId },
      include: {
        userTraining: {
          include: {
            user: true,
            dayOnCourse: {
              include: {
                course: true,
              },
            },
          },
        },
        stepOnDay: {
          include: {
            step: true,
          },
        },
        examResult: true,
      },
    });

    if (!userStep) {
      return { success: false, error: "Шаг не найден" };
    }

    const courseAuthorId = userStep.userTraining.dayOnCourse.course.authorId;
    if (courseAuthorId !== reviewerId && reviewerRole !== "ADMIN") {
      return { success: false, error: "Вы не можете проверять экзамены для чужих курсов" };
    }

    if (!userStep.examResult) {
      return { success: false, error: "Результат экзамена не найден" };
    }

    const finalComment = data.trainerComment ?? null;
    const action = data.action;

    await prisma.$transaction(async (tx) => {
      await tx.userStep.update({
        where: { id: data.userStepId },
        data: {
          status: action === "approve" ? "COMPLETED" : "IN_PROGRESS",
        },
      });
      await tx.examResult.update({
        where: { id: userStep.examResult!.id },
        data: {
          isPassed: action === "approve",
          overallScore: action === "approve" ? 100 : 0,
          trainerComment: finalComment,
          reviewedAt: new Date(),
          reviewedById: reviewerId,
          updatedAt: new Date(),
        },
      });
    });

    logger.info(
      `Тренер проверил экзамен userStep ${data.userStepId}: ${action === "approve" ? "утверждён" : "отклонён"}`,
      { reviewerId, commentProvided: Boolean(finalComment) },
    );

    const stepTitle = userStep.stepOnDay.step.title;
    const courseType = userStep.userTraining.dayOnCourse.course.type;
    const dayOrder = userStep.userTraining.dayOnCourse.order;
    const userId = userStep.userTraining.userId;

    const defaultRejectBody =
      "Тренер вернул экзамен на доработку. Ознакомьтесь с комментарием и отправьте отчёт ещё раз.";
    const trimmedComment =
      finalComment &&
      (finalComment.length > 180 ? `${finalComment.slice(0, 177)}...` : finalComment);

    const pushPayload =
      action === "approve"
        ? {
            title: `"${stepTitle}" зачтён! ✅`,
            body: "Тренер проверил ваш экзамен. Можете переходить к следующему шагу.",
          }
        : {
            title: `"${stepTitle}" требует доработки ❗️`,
            body: trimmedComment ? `Комментарий тренера: ${trimmedComment}` : defaultRejectBody,
          };

    try {
      const { sendImmediatePushNotification } = await import("@gafus/webpush");
      const pushResult = await sendImmediatePushNotification({
        userId,
        title: pushPayload.title,
        body: pushPayload.body,
        url: `/trainings/${courseType}/${dayOrder}`,
      });
      if (pushResult.success) {
        logger.success(`Пуш-уведомление отправлено пользователю ${userId}`, {
          notificationId: pushResult.notificationId,
          action,
        });
      } else {
        logger.warn(`Не удалось отправить пуш-уведомление: ${pushResult.error}`, { userId, action });
      }
    } catch (pushError) {
      logger.error("Ошибка при отправке пуш-уведомления (не критично)", pushError as Error, {
        userStepId: data.userStepId,
        action,
      });
    }

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при проверке экзамена", error as Error, { reviewerId, userStepId: data.userStepId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось проверить экзамен",
    };
  }
}

/**
 * Получает список экзаменов, ожидающих проверки тренером.
 */
export async function getPendingExamResults(
  trainerId: string,
  isAdmin: boolean,
): Promise<PendingExamResult[]> {
  const examResults = await prisma.examResult.findMany({
    where: {
      userStep: {
        status: "IN_PROGRESS",
        userTraining: {
          dayOnCourse: {
            course: {
              ...(!isAdmin && { authorId: trainerId }),
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
              user: { select: { username: true } },
              dayOnCourse: {
                include: {
                  course: { select: { name: true } },
                  day: { select: { title: true } },
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
    orderBy: { createdAt: "desc" },
  });

  return examResults.map((result) => {
    let testAnswers: Record<string, number> | null = null;
    if (result.testAnswers) {
      try {
        testAnswers =
          typeof result.testAnswers === "string"
            ? JSON.parse(result.testAnswers)
            : (result.testAnswers as Record<string, number>);
      } catch {
        // игнорируем ошибку парсинга
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
}

/**
 * Возвращает количество экзаменов, ожидающих проверки тренером.
 */
export async function getPendingExamCount(
  trainerId: string,
  isAdmin: boolean,
): Promise<number> {
  return prisma.examResult.count({
    where: {
      userStep: {
        status: "IN_PROGRESS",
        userTraining: {
          dayOnCourse: {
            course: {
              ...(!isAdmin && { authorId: trainerId }),
            },
          },
        },
      },
    },
  });
}

const EXAM_RESULTS_INCLUDE = {
  reviewedBy: {
    select: {
      id: true,
      username: true,
      profile: {
        select: {
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  },
  userStep: {
    include: {
      userTraining: {
        include: {
          user: {
            include: { profile: true },
          },
          dayOnCourse: {
            include: {
              day: true,
              course: true,
            },
          },
        },
      },
      stepOnDay: {
        include: {
          step: true,
        },
      },
    },
  },
} as const;

/**
 * Получает результаты экзаменов для тренера (все или с фильтром hideCompleted).
 */
export async function getExamResults(
  trainerId: string,
  options?: GetExamResultsOptions,
  isAdmin?: boolean,
): Promise<ExamResultWithDetails[]> {
  const examResults = await prisma.examResult.findMany({
    where: {
      userStep: {
        ...(options?.hideCompleted && { status: "IN_PROGRESS" }),
        userTraining: {
          dayOnCourse: {
            course: {
              ...(isAdmin !== true && { authorId: trainerId }),
            },
          },
        },
      },
    },
    include: EXAM_RESULTS_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return examResults as ExamResultWithDetails[];
}

/**
 * Получает результаты экзаменов по курсу (с проверкой доступа).
 */
export async function getExamResultsByCourse(
  courseId: string,
  trainerId: string,
  isAdmin: boolean,
): Promise<ExamResultWithDetails[]> {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...(!isAdmin && { authorId: trainerId }),
    },
  });
  if (!course) {
    throw new Error("Курс не найден или нет доступа");
  }
  const examResults = await prisma.examResult.findMany({
    where: {
      userStep: {
        userTraining: {
          dayOnCourse: {
            courseId,
          },
        },
      },
    },
    include: EXAM_RESULTS_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return examResults as ExamResultWithDetails[];
}

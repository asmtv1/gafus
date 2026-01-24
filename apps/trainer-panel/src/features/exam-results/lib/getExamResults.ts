"use server";

import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

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

export interface GetExamResultsOptions {
  hideCompleted?: boolean;
}

export async function getExamResults(
  options?: GetExamResultsOptions,
): Promise<ExamResultWithDetails[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }

  const isAdmin = session.user.role === "ADMIN";

  // Получаем все результаты экзаменов
  // Для админа - все экзамены всех курсов, для остальных - только свои курсы
  const examResults = await prisma.examResult.findMany({
    where: {
      userStep: {
        // Фильтруем по статусу, если включён фильтр
        ...(options?.hideCompleted && {
          status: "IN_PROGRESS",
        }),
        userTraining: {
          dayOnCourse: {
            course: {
              // Если не админ, то только свои курсы
              ...(!isAdmin && {
                authorId: session.user.id,
              }),
            },
          },
        },
      },
    },
    include: {
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
                include: {
                  profile: true,
                },
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
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return examResults;
}

export async function getExamResultsByCourse(courseId: string): Promise<ExamResultWithDetails[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }

  const isAdmin = session.user.role === "ADMIN";

  // Проверяем, что курс принадлежит текущему пользователю (или админ может видеть любой курс)
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...(!isAdmin && {
        authorId: session.user.id,
      }),
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
            courseId: courseId,
          },
        },
      },
    },
    include: {
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
                include: {
                  profile: true,
                },
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
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return examResults;
}

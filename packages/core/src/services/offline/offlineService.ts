/**
 * Offline Service
 * Сервис для работы с офлайн-данными курсов
 */
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-offline");

export interface FullCourseData {
  course: {
    id: string;
    type: string;
    name: string;
    description: string;
    shortDesc: string;
    duration: string;
    logoImg: string;
    isPrivate: boolean;
    isPaid: boolean;
    avgRating: number | null;
    trainingLevel: string;
    createdAt: string;
    updatedAt: string;
    authorUsername: string;
    videoUrl: string | null;
    equipment: string | null;
  };
  trainingDays: {
    id: string;
    order: number;
    title: string;
    description: string;
    equipment: string;
    type: string;
    steps: {
      id: string;
      order: number;
      title: string;
      description: string;
      type: string;
      durationSec: number | null;
      estimatedDurationSec: number | null;
      videoUrl: string | null;
      imageUrls: string[];
      pdfUrls: string[];
      checklist: unknown;
      requiresVideoReport: boolean;
      requiresWrittenFeedback: boolean;
      hasTestQuestions: boolean;
    }[];
  }[];
  mediaFiles: {
    videos: string[];
    images: string[];
    pdfs: string[];
  };
}

/**
 * Получение версии курса (updatedAt)
 */
export async function getCourseVersion(
  courseType: string,
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const course = await prisma.course.findFirst({
      where: { type: courseType },
      select: { updatedAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    return {
      success: true,
      version: course.updatedAt.toISOString(),
    };
  } catch (error) {
    logger.error("Error getting course version", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Проверка обновлений курса
 */
export async function checkCourseUpdates(
  courseType: string,
  clientVersion: string,
): Promise<{
  success: boolean;
  hasUpdates?: boolean;
  serverVersion?: string;
  error?: string;
}> {
  try {
    const versionResult = await getCourseVersion(courseType);

    if (!versionResult.success || !versionResult.version) {
      return {
        success: false,
        error: versionResult.error || "Не удалось получить версию курса",
      };
    }

    const serverVersion = versionResult.version;
    const clientDate = new Date(clientVersion);
    const serverDate = new Date(serverVersion);

    const hasUpdates = serverDate.getTime() > clientDate.getTime();

    return {
      success: true,
      hasUpdates,
      serverVersion,
    };
  } catch (error) {
    logger.error("Error checking course updates", error as Error, {
      courseType,
      clientVersion,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Скачивание полного курса
 */
export async function downloadFullCourse(
  courseType: string,
): Promise<{ success: boolean; data?: FullCourseData; error?: string }> {
  try {
    logger.info("Downloading full course", { courseType });

    // Получаем полные данные курса
    const course = await prisma.course.findFirst({
      where: { type: courseType },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        shortDesc: true,
        duration: true,
        logoImg: true,
        isPrivate: true,
        isPaid: true,
        avgRating: true,
        trainingLevel: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            username: true,
          },
        },
        videoUrl: true,
        equipment: true,
        dayLinks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            day: {
              select: {
                id: true,
                title: true,
                description: true,
                equipment: true,
                type: true,
                stepLinks: {
                  orderBy: { order: "asc" },
                  select: {
                    id: true,
                    order: true,
                    step: {
                      select: {
                        id: true,
                        title: true,
                        description: true,
                        durationSec: true,
                        estimatedDurationSec: true,
                        videoUrl: true,
                        imageUrls: true,
                        pdfUrls: true,
                        type: true,
                        checklist: true,
                        requiresVideoReport: true,
                        requiresWrittenFeedback: true,
                        hasTestQuestions: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    // Формируем структуру данных курса
    const trainingDays = course.dayLinks.map((dayLink) => ({
      id: dayLink.id,
      order: dayLink.order,
      title: dayLink.day.title,
      description: dayLink.day.description || "",
      equipment: dayLink.day.equipment || "",
      type: dayLink.day.type,
      steps: dayLink.day.stepLinks.map((stepLink) => ({
        id: stepLink.step.id,
        order: stepLink.order,
        title: stepLink.step.title,
        description: stepLink.step.description || "",
        type: stepLink.step.type || "TRAINING",
        durationSec: stepLink.step.durationSec,
        estimatedDurationSec: stepLink.step.estimatedDurationSec,
        videoUrl: stepLink.step.videoUrl,
        imageUrls: stepLink.step.imageUrls,
        pdfUrls: stepLink.step.pdfUrls,
        checklist: stepLink.step.checklist,
        requiresVideoReport: stepLink.step.requiresVideoReport,
        requiresWrittenFeedback: stepLink.step.requiresWrittenFeedback,
        hasTestQuestions: stepLink.step.hasTestQuestions,
      })),
    }));

    // Собираем все URL медиафайлов
    const videoUrls: string[] = [];
    const imageUrls: string[] = [];
    const pdfUrls: string[] = [];

    // Видео курса
    if (course.videoUrl) {
      videoUrls.push(course.videoUrl);
    }

    // Логотип курса
    if (course.logoImg) {
      imageUrls.push(course.logoImg);
    }

    // Медиафайлы из шагов
    for (const day of trainingDays) {
      for (const step of day.steps) {
        if (step.videoUrl) {
          videoUrls.push(step.videoUrl);
        }
        imageUrls.push(...step.imageUrls);
        pdfUrls.push(...step.pdfUrls);
      }
    }

    // Удаляем дубликаты
    const uniqueVideoUrls = Array.from(new Set(videoUrls));
    const uniqueImageUrls = Array.from(new Set(imageUrls));
    const uniquePdfUrls = Array.from(new Set(pdfUrls));

    logger.info("Course data prepared for download", {
      courseId: course.id,
      courseType: course.type,
      daysCount: trainingDays.length,
      totalSteps: trainingDays.reduce((sum, day) => sum + day.steps.length, 0),
      totalVideos: uniqueVideoUrls.length,
      totalImages: uniqueImageUrls.length,
      totalPdfs: uniquePdfUrls.length,
    });

    const courseData: FullCourseData = {
      course: {
        id: course.id,
        type: course.type,
        name: course.name,
        description: course.description || "",
        shortDesc: course.shortDesc || "",
        duration: course.duration || "",
        logoImg: course.logoImg,
        isPrivate: course.isPrivate,
        isPaid: course.isPaid,
        avgRating: course.avgRating,
        trainingLevel: course.trainingLevel,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
        authorUsername: course.author.username,
        videoUrl: course.videoUrl,
        equipment: course.equipment,
      },
      trainingDays,
      mediaFiles: {
        videos: uniqueVideoUrls,
        images: uniqueImageUrls,
        pdfs: uniquePdfUrls,
      },
    };

    return { success: true, data: courseData };
  } catch (error) {
    logger.error("Error downloading full course", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

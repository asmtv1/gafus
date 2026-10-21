import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createWebLogger } from "@gafus/logger";
import { TrainingPageClient } from "@/features/training";
import { getTrainingDays } from "@shared/lib/training/getTrainingDays";
import { checkAndCompleteCourse } from "@shared/lib/user/userCourses";
import { getCourseMetadata, getCourseOutline } from "@gafus/core/services/course";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { generateCourseMetadata } from "@gafus/metadata";

import styles from "./trainings.module.css";

const logger = createWebLogger("web-trainings-page");

// Отключаем кэш RSC: каждый запрос проверяет доступ заново (важно для платных курсов)
export const dynamic = "force-dynamic";

interface TrainingsPageProps {
  params: Promise<{ courseType: string }>;
}

// Генерация метаданных для Open Graph (Telegram, соц.сети)
export async function generateMetadata({ params }: TrainingsPageProps): Promise<Metadata> {
  const { courseType } = await params;
  const course = await getCourseMetadata(courseType);

  // Private course metadata is not public, including Open Graph previews.
  if (!course || course.isPrivate) {
    return {
      title: "Курс",
      description: "Пошаговая тренировка для вашего питомца",
    };
  }

  return generateCourseMetadata({
    name: course.name,
    description: course.shortDesc || course.description,
    type: courseType,
    logoUrl: course.logoImg,
  });
}

export default async function TrainingsPage({ params }: TrainingsPageProps) {
  const { courseType } = await params;

  // async-parallel: независимые запросы выполняем параллельно (Vercel React Best Practices)
  const [courseMetadata, userIdResult] = await Promise.all([
    getCourseMetadata(courseType),
    getCurrentUserId().then((id) => id as string).catch(() => null),
  ]);
  const userId = userIdResult;

  if (!userId && courseMetadata?.isPrivate) {
    redirect("/");
  }

  let serverData: Awaited<ReturnType<typeof getTrainingDays>> | null = null;
  let serverError: string | null = null;

  if (userId) {
    try {
      const data = await getTrainingDays(courseType, userId);
      serverData = data;
      await checkAndCompleteCourse(data.trainingDays, data.courseId);
    } catch (error) {
      if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
        serverError = "COURSE_ACCESS_DENIED";
      } else {
        logger.error(
          "Неожиданная ошибка загрузки дней тренировки",
          error instanceof Error ? error : new Error(String(error)),
          { courseType, userId },
        );
      }
    }
  }

  const accessDenied = serverError === "COURSE_ACCESS_DENIED";
  // A private course's title is not public metadata for unassigned visitors.
  const courseName = accessDenied && courseMetadata?.isPrivate ? undefined : courseMetadata?.name;
  const courseForPay =
    accessDenied &&
    courseMetadata?.isPaid &&
    !courseMetadata?.isPrivate &&
    courseMetadata?.id
      ? {
          id: courseMetadata.id,
          name: courseMetadata.name ?? "",
          type: courseType,
        }
      : null;
  const accessDeniedReason: "private" | "paid" | null = accessDenied
    ? courseForPay
      ? "paid"
      : "private"
    : null;

  const courseOutline =
    accessDeniedReason === "paid" && courseType ? await getCourseOutline(courseType) : [];
  const courseDescription =
    accessDeniedReason === "paid" && courseMetadata
      ? courseMetadata.description ?? courseMetadata.shortDesc ?? null
      : null;
  const courseVideoUrl =
    accessDeniedReason === "paid" && courseMetadata ? courseMetadata.videoUrl ?? null : null;
  const courseEquipment =
    accessDeniedReason === "paid" && courseMetadata ? courseMetadata.equipment ?? null : null;
  const courseTrainingLevel =
    accessDeniedReason === "paid" && courseMetadata ? courseMetadata.trainingLevel ?? null : null;

  return (
    <main className={styles.container}>
      <h2 className={styles.title}>Содержание</h2>
      <TrainingPageClient
        courseType={courseType}
        courseName={courseName}
        initialData={serverData}
        initialError={serverError}
        accessDenied={accessDenied}
        accessDeniedReason={accessDeniedReason}
        courseForPay={courseForPay}
        courseOutline={courseOutline}
        courseDescription={courseDescription}
        courseVideoUrl={courseVideoUrl}
        courseEquipment={courseEquipment}
        courseTrainingLevel={courseTrainingLevel}
        userId={userId ?? undefined}
      />
    </main>
  );
}

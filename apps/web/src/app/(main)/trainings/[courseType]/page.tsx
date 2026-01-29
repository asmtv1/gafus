import type { Metadata } from "next";

import TrainingPageClient from "@features/training/components/TrainingPageClient";
import { getTrainingDays } from "@shared/lib/training/getTrainingDays";
import { checkAndCompleteCourse } from "@shared/lib/user/userCourses";
import { getCourseMetadata } from "@gafus/core/services/course";
import { checkCourseAccessById } from "@gafus/core/services/course";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { generateCourseMetadata } from "@gafus/metadata";

import styles from "./trainings.module.css";

// Отключаем кэш RSC: каждый запрос проверяет доступ заново (важно для платных курсов)
export const dynamic = "force-dynamic";

interface TrainingsPageProps {
  params: Promise<{ courseType: string }>;
}

// Генерация метаданных для Open Graph (Telegram, соц.сети)
export async function generateMetadata({ params }: TrainingsPageProps): Promise<Metadata> {
  const { courseType } = await params;
  const course = await getCourseMetadata(courseType);

  if (!course) {
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

  const courseMetadata = await getCourseMetadata(courseType);
  const courseName = courseMetadata?.name;

  let userId: string | null = null;
  try {
    userId = await getCurrentUserId();
  } catch (_) {
    if (courseMetadata?.isPaid && courseMetadata?.id) {
      const serverError = "COURSE_ACCESS_DENIED";
      const courseForPay = {
        id: courseMetadata.id,
        name: courseMetadata.name ?? "",
        type: courseType,
        priceRub: courseMetadata.priceRub != null ? Number(courseMetadata.priceRub) : 0,
      };
      return (
        <main className={styles.container}>
          <h2 className={styles.title}>Содержание</h2>
          <TrainingPageClient
            courseType={courseType}
            courseName={courseName}
            initialData={null}
            initialError={serverError}
            accessDenied
            accessDeniedReason="paid"
            courseForPay={courseForPay}
            userId={undefined}
          />
        </main>
      );
    }
  }

  let serverData: Awaited<ReturnType<typeof getTrainingDays>> | null = null;
  let serverError: string | null = null;

  if (userId) {
    try {
      const data = await getTrainingDays(courseType, userId);
      if (courseMetadata?.isPaid && courseMetadata?.id) {
        const { hasAccess } = await checkCourseAccessById(courseMetadata.id, userId);
        if (!hasAccess) {
          serverError = "COURSE_ACCESS_DENIED";
        } else {
          serverData = data;
          await checkAndCompleteCourse(data.trainingDays, data.courseId);
        }
      } else {
        serverData = data;
        await checkAndCompleteCourse(data.trainingDays, data.courseId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
        serverError = "COURSE_ACCESS_DENIED";
      } else {
        serverError = null;
      }
    }
  }

  const accessDenied = serverError === "COURSE_ACCESS_DENIED";
  const courseForPay =
    accessDenied &&
    courseMetadata?.isPaid &&
    courseMetadata?.id
      ? {
          id: courseMetadata.id,
          name: courseMetadata.name ?? "",
          type: courseType,
          priceRub: courseMetadata.priceRub != null ? Number(courseMetadata.priceRub) : 0,
        }
      : null;
  const accessDeniedReason: "private" | "paid" | null = accessDenied
    ? courseForPay
      ? "paid"
      : "private"
    : null;

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
        userId={userId ?? undefined}
      />
    </main>
  );
}

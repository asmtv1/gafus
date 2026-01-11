import type { Metadata } from "next";

import TrainingPageClient from "@features/training/components/TrainingPageClient";
import { getTrainingDays } from "@shared/lib/training/getTrainingDays";
import { checkAndCompleteCourse } from "@shared/lib/user/userCourses";
import { getCourseMetadata } from "@shared/lib/course/getCourseMetadata";
import { getCurrentUserId } from "@/utils";
import { generateCourseMetadata } from "@gafus/metadata";

import styles from "./trainings.module.css";

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
  
  // Получаем метаданные курса для названия
  const courseMetadata = await getCourseMetadata(courseType);
  const courseName = courseMetadata?.name;
  
  // Загружаем данные с сервера для SEO и проверки завершения курса
  let serverData = null;
  let serverError = null;
  
  try {
    // Получаем userId на сервере
    const userId = await getCurrentUserId();
    const data = await getTrainingDays(courseType, userId);
    serverData = data;
    // Проверяем завершение курса
    await checkAndCompleteCourse(serverData.trainingDays, serverData.courseId);
  } catch (error) {
    // Пробрасываем специфичную ошибку доступа
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      serverError = "COURSE_ACCESS_DENIED";
    } else {
      // В случае ошибки сервера (например, офлайн), не показываем ошибку
      // Client Component сам разберется с кэшем
      serverError = null;
    }
  }

  return (
    <main className={styles.container}>
      <h2 className={styles.title}>Содержание</h2>
      <TrainingPageClient 
        courseType={courseType}
        courseName={courseName}
        initialData={serverData}
        initialError={serverError}
      />
    </main>
  );
}

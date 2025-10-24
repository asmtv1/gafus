import type { Metadata } from "next";

import TrainingPageClient from "@features/training/components/TrainingPageClient";
import { getTrainingDaysCached } from "@shared/lib/actions/cachedCourses";
import { checkAndCompleteCourse } from "@shared/lib/user/userCourses";
import { getCourseMetadata } from "@shared/lib/course/getCourseMetadata";
import { getCurrentUserId } from "@/utils";
import { generateCourseOGMetadata } from "@/utils/metadata";

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

  return generateCourseOGMetadata(
    course.name,
    course.shortDesc || course.description,
    courseType,
    course.logoImg,
  );
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
    const result = await getTrainingDaysCached(courseType, userId);
    if (result.success) {
      serverData = result.data;
      // Проверяем завершение курса
      await checkAndCompleteCourse(serverData.trainingDays, serverData.courseId);
    } else {
      serverError = result.error;
    }
  } catch  {
    // В случае ошибки сервера (например, офлайн), не показываем ошибку
    // Client Component сам разберется с кэшем
    serverError = null;
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

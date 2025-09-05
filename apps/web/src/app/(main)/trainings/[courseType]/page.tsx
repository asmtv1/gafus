import TrainingPageClient from "@features/training/components/TrainingPageClient";
import { getTrainingDaysCached } from "@shared/lib/actions/cachedCourses";
import { checkAndCompleteCourse } from "@shared/lib/user/userCourses";

import styles from "./trainings.module.css";

interface TrainingsPageProps {
  params: Promise<{ courseType: string }>;
}

export default async function TrainingsPage({ params }: TrainingsPageProps) {
  const { courseType } = await params;
  
  // Загружаем данные с сервера для SEO и проверки завершения курса
  let serverData = null;
  let serverError = null;
  
  try {
    const result = await getTrainingDaysCached(courseType);
    if (result.success) {
      serverData = result.data;
      // Проверяем завершение курса
      await checkAndCompleteCourse(serverData.trainingDays, serverData.courseId);
    } else {
      serverError = result.error;
    }
  } catch (error) {
    // В случае ошибки сервера (например, офлайн), не показываем ошибку
    // Client Component сам разберется с кэшем
    serverError = null;
  }

  return (
    <main className={styles.container}>
      <h2 className={styles.title}>Содержание</h2>
      <TrainingPageClient 
        courseType={courseType}
        initialData={serverData}
        initialError={serverError}
      />
    </main>
  );
}

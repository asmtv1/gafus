import CourseDescriptionWithVideo from "@features/training/components/CourseDescriptionWithVideo";
import TrainingDayList from "@features/training/components/TrainingDayList";
import { getTrainingDays } from "@shared/lib/training/getTrainingDays";
import { checkAndCompleteCourse } from "@shared/lib/user/userCourses";

import styles from "./trainings.module.css";

interface TrainingsPageProps {
  params: Promise<{ courseType: string }>;
}

export default async function TrainingsPage({ params }: TrainingsPageProps) {
  const { courseType } = await params;
  const { trainingDays, courseDescription, courseId, courseVideoUrl } =
    await getTrainingDays(courseType);

  await checkAndCompleteCourse(trainingDays, courseId);

  return (
    <main className={styles.container}>
      <h2 className={styles.title}>Содержание</h2>
      <div className={styles.courseDescription}>
        <CourseDescriptionWithVideo description={courseDescription} videoUrl={courseVideoUrl} />
      </div>

      <h3 className={styles.plan}>План занятий:</h3>
      <TrainingDayList courseType={courseType} days={trainingDays} />
    </main>
  );
}

import Link from "next/link";
import styles from "./trainings.module.css";
import { getTrainingDays } from "@/lib/training/getTrainingDays";
import { completeUserCourse } from "@/lib/user/userCourses";

type TrainingsPageProps = {
  params: Promise<{ courseType: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseType: string }>;
}) {
  const { courseType } = await params;
  const { courseDescription } = await getTrainingDays(courseType);

  return {
    title: `Тренировки: ${courseType}`,
    description: courseDescription || "План пошаговых тренировок по курсу.",
  };
}

export default async function TrainingsPage({ params }: TrainingsPageProps) {
  const { courseType } = await params;
  const { trainingDays, courseDescription, courseId } = await getTrainingDays(
    courseType
  );
  const allDaysCompleted = trainingDays?.every(
    (day) => day.userStatus === "COMPLETED"
  );

  if (allDaysCompleted && courseId) {
    await completeUserCourse(courseId); //НА СЕРВЕР
  }

  const getItemClass = (status: string) => {
    if (status === "IN_PROGRESS") return `${styles.item} ${styles.inprogress}`;
    if (status === "COMPLETED") return `${styles.item} ${styles.completed}`;
    return styles.item;
  };

  return (
    <main className={styles.container}>
      <div className={styles.courseDescription}>
        <h1 className={styles.heading}>О курсе: </h1>
        <p>{courseDescription}</p>
      </div>

      <p className={styles.plan}>План занятий: </p>
      <ul className={styles.list}>
        {trainingDays?.map((day) => (
          <li key={day.id} className={getItemClass(day.userStatus)}>
            <Link
              href={`/trainings/${courseType}/${day.day}`}
              className={styles.link}
            >
              <span className={styles.day}>{day.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

// app/courses/page.tsx
import { getCoursesWithProgressCached } from "@shared/lib/actions/cachedCourses";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import styles from "./page.module.css";
import CoursesClient from "./CoursesClient";

export const revalidate = 60;

export const metadata = {
  title: "Список курсов",
  description: "Выбирайте курсы для послушания, фокуса и социализации вашей собаки.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Список курсов",
    description: "Выбирайте курсы для послушания, фокуса и социализации вашей собаки.",
    type: "website",
  },
};

export default async function CoursesPage() {
  // Загружаем данные курсов серверно для кэширования
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  let coursesData = null;
  let error = null;

  if (userId) {
    try {
      const result = await getCoursesWithProgressCached(userId);
      if (result.success) {
        coursesData = result.data;
      } else {
        error = result.error;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Ошибка загрузки курсов";
    }
  }

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Курсы</h1>
      <CoursesClient 
        initialCourses={coursesData} 
        initialError={error}
        userId={userId}
      />
    </main>
  );
}

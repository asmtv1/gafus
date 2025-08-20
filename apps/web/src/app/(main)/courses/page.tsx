// app/courses/page.tsx
import CoursesClient from "./CoursesClient";
import styles from "./page.module.css";

export const revalidate = 60;

export const metadata = {
  title: "Список курсов",
  description: "Выбирайте курсы для послушания, фокуса и социализации вашей собаки.",
};
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  // Теперь данные будут загружаться через courseStore в клиентском компоненте
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Курсы</h1>
      <CoursesClient />
    </main>
  );
}

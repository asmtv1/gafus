import type { Course } from "@/types/course";
import { getFavoritesCourses } from "@/lib/course/getFavoritesCourses";
import styles from "./favorites.module.css";
import { FavoritesList } from "@/components/CourseCard/FavoritesCourseList";
export const metadata = {
  title: "Избранные курсы",
  description: "Курсы которые вы добавили в избранное",
};
export default async function FavoritesPage() {
  const { data } = await getFavoritesCourses();
  const courses: Course[] = data ?? [];

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Избранные курсы</h1>
      <ul className={styles.list}>
        <FavoritesList initialCourses={courses} />
      </ul>
    </main>
  );
}

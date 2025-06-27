import type { Course } from "@/types/course";
import { CourseCard } from "@/components/CourseCard/CourseCard";
import styles from "./courses.module.css";
import { getCoursesWithProgress } from "@/lib/course/getCourses";

export const revalidate = 60; // seconds

export const metadata = {
  title: "Список курсов",
  description: "Выбирайте курсы для послушания, фокуса и социализации вашей собаки.",
};

export default async function CoursesPage() {
  const courses: Course[] = (await getCoursesWithProgress()).data ?? [];

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Доступные курсы</h1>
      <ul className={styles.list}>
        {courses.length === 0 ? (
          <p>Курсы не найдены</p>
        ) : (
          courses.map((course) => (
            <CourseCard
              key={course.id}
              {...course}
              reviews={course.reviews.map((r) => ({
                id: r.id,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                courseId: r.courseId,
                userId: r.userId,
                rating: r.rating ?? 0,
                comment: r.comment ?? null,
              }))}
            />
          ))
        )}
      </ul>
    </main>
  );
}

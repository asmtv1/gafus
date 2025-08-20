"use client";

import { CourseCard } from "@features/courses/components/CourseCard";
import PullToRefresh from "@shared/components/ui/PullToRefresh";
import { CoursesSkeleton } from "@shared/components/ui/Skeleton";
import { useCourseStoreActions } from "@shared/stores";
import { useEffect } from "react";

import styles from "./page.module.css";

export default function CoursesClient() {
  const { allCourses, loading, errors, fetchAllCourses, forceRefreshFavorites } =
    useCourseStoreActions();

  // Загружаем курсы при монтировании компонента
  useEffect(() => {
    // Загружаем курсы только если они еще не загружены
    if (!allCourses && !loading.all) {
      fetchAllCourses().catch((_error) => {
        // Ошибка уже обрабатывается в store
      });
    }
  }, [allCourses, loading.all]); // Убираем fetchAllCourses из зависимостей

  // Слушаем глобальные изменения избранного для синхронизации состояния
  useEffect(() => {
    const handleFavoritesChanged = () => {
      // Принудительно обновляем состояние избранного при изменении
      forceRefreshFavorites();
    };

    window.addEventListener("favoritesChanged", handleFavoritesChanged);

    return () => {
      window.removeEventListener("favoritesChanged", handleFavoritesChanged);
    };
  }, [forceRefreshFavorites]);

  // Функция обновления курсов
  const handleCoursesRefresh = async () => {
    try {
      // Обновляем store
      await fetchAllCourses();
    } catch (error) {
      console.error("❌ Ошибка обновления курсов:", error);
      throw error; // Перебрасываем ошибку для обработки в PullToRefresh
    }
  };

  // Показываем скелетон во время загрузки
  if (loading.all) {
    return <CoursesSkeleton />;
  }

  // Показываем ошибку если есть
  if (errors.all) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "red" }}>
        Ошибка загрузки курсов: {errors.all}
      </div>
    );
  }

  const courses = allCourses?.data || [];

  return (
    <PullToRefresh
      onRefresh={handleCoursesRefresh}
      refreshType="custom"
      threshold={75}
      maxPullDistance={130}
    >
      <div className={styles.container}>
        <ul className={styles.courseList}>
          {courses.map((course, index) => (
            <CourseCard key={course.id} {...course} index={index} />
          ))}
        </ul>
      </div>
    </PullToRefresh>
  );
}

"use client";

import PullToRefresh from "@shared/components/ui/PullToRefresh";
import { CoursesSkeleton } from "@shared/components/ui/Skeleton";
import { useCourseStoreActions } from "@shared/stores";
import { useEffect } from "react";
import type { CourseWithProgressData } from "@gafus/types";

import styles from "./page.module.css";
import { CourseCard } from "@/features/courses/components/CourseCard/CourseCard";

interface CoursesClientProps {
  initialCourses?: CourseWithProgressData[] | null;
  initialError?: string | null;
  userId?: string;
}

export default function CoursesClient({ 
  initialCourses, 
  initialError, 
  userId 
}: CoursesClientProps) {
  const { allCourses, loading, errors, fetchAllCourses, forceRefreshFavorites, setAllCourses } =
    useCourseStoreActions();

  // Инициализируем данные при монтировании компонента
  useEffect(() => {
    // Если есть серверные данные, используем их
    if (initialCourses && !allCourses) {
      setAllCourses(initialCourses, "server");
    }
    // Если есть ошибка сервера, показываем её
    else if (initialError && !allCourses) {
      // Ошибка будет обработана в store
    }
    // Если нет серверных данных и нет загруженных курсов, загружаем клиентски
    else if (!initialCourses && !allCourses && !loading.all && userId) {
      fetchAllCourses().catch((_error) => {
        // Ошибка уже обрабатывается в store
      });
    }
  }, [initialCourses, initialError, allCourses, loading.all, userId, setAllCourses, fetchAllCourses]);

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

  // Показываем ошибку если есть (серверная или клиентская)
  if (errors.all || initialError) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "red" }}>
        Ошибка загрузки курсов: {errors.all || initialError}
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

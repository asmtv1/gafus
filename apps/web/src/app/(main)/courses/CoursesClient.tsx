"use client";
import { CoursesSkeleton } from "@shared/components/ui/Skeleton";
import { useCourseStoreActions } from "@shared/stores";
import { useEffect, useState } from "react";
import type { CourseWithProgressData } from "@gafus/types";

import styles from "./courses.module.css";
import { CourseCard } from "@/features/courses/components/CourseCard/CourseCard";
import CourseTabs, { type CourseTabType } from "@/features/courses/components/CourseTabs/CourseTabs";
import { filterCoursesByTab } from "@/features/courses/utils/courseFilters";

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
  const [activeTab, setActiveTab] = useState<CourseTabType>("free");
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

  const allCoursesData = allCourses?.data || [];
  const filteredCourses = filterCoursesByTab(allCoursesData, activeTab);

  return (
    <div className={styles.container}>
      <CourseTabs 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
      />
      <ul className={styles.courseList}>
        {filteredCourses.map((course, index) => (
          <CourseCard key={course.id} {...course} index={index} />
        ))}
      </ul>
      {filteredCourses.length === 0 && (
        <div className={styles.emptyState}>
          <p>В этой категории пока нет курсов</p>
        </div>
      )}
    </div>
  );
}

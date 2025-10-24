"use client";
import { CoursesSkeleton } from "@shared/components/ui/Skeleton";
import { useCourseStoreActions } from "@shared/stores";
import { useEffect, useState } from "react";
import type { CourseWithProgressData } from "@gafus/types";

import styles from "./courses.module.css";
import { CourseCard } from "@/features/courses/components/CourseCard/CourseCard";
import type { CourseTabType } from "@/features/courses/components/CourseTabs/CourseTabs";
import CourseSearch from "@/features/courses/components/CourseSearch/CourseSearch";
import CourseFilters, { 
  type TrainingLevelType, 
  type ProgressFilterType, 
  type SortingType, 
  type RatingFilterType 
} from "@/features/courses/components/CourseFilters";
import { filterAndSortCourses } from "@/features/courses/utils/courseFilters";

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
  // Состояние фильтров
  const [activeTab, setActiveTab] = useState<CourseTabType>("free");
  const [activeLevel, setActiveLevel] = useState<TrainingLevelType>("ALL");
  const [activeProgress, setActiveProgress] = useState<ProgressFilterType>("ALL");
  const [activeRating, setActiveRating] = useState<RatingFilterType>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSorting, setActiveSorting] = useState<SortingType>("newest");

  // Функция сброса всех фильтров
  const handleResetFilters = () => {
    setSearchQuery(""); // Также сбрасываем поиск
  };
  
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
  
  // Применяем все фильтры и сортировку
  const filteredCourses = filterAndSortCourses(allCoursesData, {
    tab: activeTab,
    level: activeLevel,
    progress: activeProgress,
    rating: activeRating,
    search: searchQuery,
    sorting: activeSorting,
  });

  // Функция для получения количества результатов по фильтрам (для preview в drawer)
  const getResultsCount = (filters: {
    tab: CourseTabType;
    level: TrainingLevelType;
    progress: ProgressFilterType;
    rating: RatingFilterType;
  }) => {
    return filterAndSortCourses(allCoursesData, {
      tab: filters.tab,
      level: filters.level,
      progress: filters.progress,
      rating: filters.rating,
      search: searchQuery,
      sorting: activeSorting,
    }).length;
  };

  return (
    <div className={styles.container}>
      {/* Поиск */}
      <CourseSearch 
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {/* Все фильтры в выпадающих списках */}
      <CourseFilters
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeLevel={activeLevel}
        onLevelChange={setActiveLevel}
        activeProgress={activeProgress}
        onProgressChange={setActiveProgress}
        activeRating={activeRating}
        onRatingChange={setActiveRating}
        activeSorting={activeSorting}
        onSortingChange={setActiveSorting}
        onResetFilters={handleResetFilters}
        getResultsCount={getResultsCount}
      />

      {/* Список курсов */}
      <ul className={styles.courseList}>
        {filteredCourses.map((course, index) => (
          <CourseCard key={course.id} {...course} index={index} />
        ))}
      </ul>
      
      {/* Пустое состояние */}
      {filteredCourses.length === 0 && (
        <div className={styles.emptyState}>
          <p>
            {searchQuery 
              ? `По запросу "${searchQuery}" ничего не найдено`
              : "В этой категории пока нет курсов"
            }
          </p>
        </div>
      )}
    </div>
  );
}

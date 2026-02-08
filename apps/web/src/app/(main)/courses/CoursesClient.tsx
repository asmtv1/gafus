"use client";
import { CoursesSkeleton } from "@shared/components/ui/Skeleton";
import { useCourseStoreActions } from "@shared/stores";
import { useEffect, useState } from "react";
import type { CourseWithProgressData } from "@gafus/types";
import { useCourseProgressSync } from "@shared/hooks/useCourseProgressSync";
import { SyncStatusIndicator } from "@shared/components/ui/SyncStatusIndicator";

import styles from "./courses.module.css";
import { CourseCard } from "@/features/courses/components/CourseCard/CourseCard";
import {
  PaidCourseDrawer,
  type PaidCourseDrawerCourse,
} from "@/features/courses/components/PaidCourseDrawer";
import type { CourseTabType } from "@/features/courses/components/CourseTabs/CourseTabs";
import CourseSearch from "@/features/courses/components/CourseSearch/CourseSearch";
import CourseFilters, {
  type TrainingLevelType,
  type ProgressFilterType,
  type SortingType,
  type RatingFilterType,
} from "@/features/courses/components/CourseFilters";
import { filterAndSortCourses } from "@shared/utils/courseFilters";

const COURSES_FILTERS_STORAGE_KEY = "courses-filters";

const VALID_TABS: CourseTabType[] = ["all", "free", "paid", "private"];
const VALID_LEVELS: TrainingLevelType[] = ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];
const VALID_SORTING: SortingType[] = ["newest", "rating", "name", "progress"];

function loadFiltersFromStorage(): {
  tab: CourseTabType;
  level: TrainingLevelType;
  progress: ProgressFilterType;
  rating: RatingFilterType;
  search: string;
  sorting: SortingType;
} {
  if (typeof window === "undefined") {
    return {
      tab: "all",
      level: "ALL",
      progress: "ALL",
      rating: "ALL",
      search: "",
      sorting: "newest",
    };
  }
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(COURSES_FILTERS_STORAGE_KEY) : null;
    if (!raw) return getDefaultFilters();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      tab: VALID_TABS.includes(parsed.tab as CourseTabType) ? (parsed.tab as CourseTabType) : "all",
      level: VALID_LEVELS.includes(parsed.level as TrainingLevelType)
        ? (parsed.level as TrainingLevelType)
        : "ALL",
      progress:
        typeof parsed.progress === "string" &&
        ["ALL", "NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(parsed.progress)
          ? (parsed.progress as ProgressFilterType)
          : "ALL",
      rating:
        typeof parsed.rating === "string" && ["ALL", "4+", "3+", "ANY"].includes(parsed.rating)
          ? (parsed.rating as RatingFilterType)
          : "ALL",
      search: typeof parsed.search === "string" ? parsed.search : "",
      sorting: VALID_SORTING.includes(parsed.sorting as SortingType)
        ? (parsed.sorting as SortingType)
        : "newest",
    };
  } catch {
    return getDefaultFilters();
  }
}

function getDefaultFilters() {
  return {
    tab: "all" as CourseTabType,
    level: "ALL" as TrainingLevelType,
    progress: "ALL" as ProgressFilterType,
    rating: "ALL" as RatingFilterType,
    search: "",
    sorting: "newest" as SortingType,
  };
}

interface CoursesClientProps {
  initialCourses?: CourseWithProgressData[] | null;
  initialError?: string | null;
  userId?: string;
}

export default function CoursesClient({
  initialCourses,
  initialError,
  userId,
}: CoursesClientProps) {
  const [filters, setFilters] = useState(() => loadFiltersFromStorage());
  const {
    tab: activeTab,
    level: activeLevel,
    progress: activeProgress,
    rating: activeRating,
    search: searchQuery,
    sorting: activeSorting,
  } = filters;
  const [paidDrawerCourse, setPaidDrawerCourse] = useState<PaidCourseDrawerCourse | null>(null);

  const setActiveTab = (tab: CourseTabType) =>
    setFilters((prev) => ({ ...prev, tab }));
  const setActiveLevel = (level: TrainingLevelType) =>
    setFilters((prev) => ({ ...prev, level }));
  const setActiveProgress = (progress: ProgressFilterType) =>
    setFilters((prev) => ({ ...prev, progress }));
  const setActiveRating = (rating: RatingFilterType) =>
    setFilters((prev) => ({ ...prev, rating }));
  const setSearchQuery = (search: string) =>
    setFilters((prev) => ({ ...prev, search }));
  const setActiveSorting = (sorting: SortingType) =>
    setFilters((prev) => ({ ...prev, sorting }));

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(COURSES_FILTERS_STORAGE_KEY, JSON.stringify(filters));
      }
    } catch {
      // Quota exceeded or private mode
    }
  }, [filters]);

  const handleResetFilters = () => {
    setFilters((prev) => ({ ...prev, search: "" }));
  };

  const { allCourses, loading, errors, fetchAllCourses, forceRefreshFavorites, setAllCourses } =
    useCourseStoreActions();

  // Добавляем синхронизацию прогресса
  const { syncedCourses } = useCourseProgressSync();

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
  }, [
    initialCourses,
    initialError,
    allCourses,
    loading.all,
    userId,
    setAllCourses,
    fetchAllCourses,
  ]);

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

  const allCoursesData = syncedCourses || allCourses?.data || [];

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
      {/* Индикатор синхронизации */}
      <SyncStatusIndicator className={styles.syncIndicator} />

      {/* Поиск */}
      <CourseSearch value={searchQuery} onChange={setSearchQuery} />

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
          <CourseCard
            key={course.id}
            {...course}
            index={index}
            onPaidCourseClick={setPaidDrawerCourse}
          />
        ))}
      </ul>

      <PaidCourseDrawer
        open={!!paidDrawerCourse}
        course={paidDrawerCourse}
        onClose={() => setPaidDrawerCourse(null)}
        userId={userId}
      />

      {/* Пустое состояние */}
      {filteredCourses.length === 0 && (
        <div className={styles.emptyState}>
          <p>
            {searchQuery
              ? `По запросу "${searchQuery}" ничего не найдено`
              : "В этой категории пока нет курсов"}
          </p>
        </div>
      )}
    </div>
  );
}

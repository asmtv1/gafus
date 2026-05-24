"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { reportClientError } from "@gafus/error-handling";
import type { TodayDailyCourseResponse } from "@gafus/core/services/dailyCourse";
import { DAILY_COURSE_LOGO } from "@gafus/metadata";
import type { CourseWithProgressData } from "@gafus/types";

import { CoursesSkeleton } from "@shared/components/ui/Skeleton";
import { SyncStatusIndicator } from "@shared/components/ui/SyncStatusIndicator";
import { useCourseProgressSync } from "@shared/hooks/useCourseProgressSync";
import { useCourseStoreActions } from "@shared/stores";

import styles from "./courses.module.css";
import {
  CourseCard,
  CourseFilters,
  CourseSearch,
  PaidCourseDrawer,
  type CourseTabType,
  type PaidCourseDrawerCourse,
  type ProgressFilterType,
  type RatingFilterType,
  type SortingType,
  type TrainingLevelType,
} from "@/features/courses";
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
  } catch (error) {
    reportClientError(error, {
      issueKey: "CoursesClient",
      keys: { operation: "load_filters_from_storage" },
    });
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

function getCourseIdsKey(courses?: CourseWithProgressData[] | null): string {
  if (!courses?.length) return "";
  return courses
    .map((course) => course.id)
    .toSorted()
    .join(",");
}

interface CoursesClientProps {
  initialCourses?: CourseWithProgressData[] | null;
  initialError?: string | null;
  userId?: string;
  initialDailyCourse?: TodayDailyCourseResponse | null;
}

export default function CoursesClient({
  initialCourses,
  initialError,
  userId,
  initialDailyCourse,
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
    } catch (error) {
      reportClientError(error, {
        issueKey: "CoursesClient",
        keys: { operation: "persist_course_filters" },
      });
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
  const allCoursesData = useMemo(
    () => syncedCourses ?? allCourses?.data ?? [],
    [syncedCourses, allCourses?.data],
  );
  const currentCourseIdsKey = useMemo(() => getCourseIdsKey(allCourses?.data), [allCourses?.data]);
  const initialCourseIdsKey = useMemo(() => getCourseIdsKey(initialCourses), [initialCourses]);

  // Инициализируем данные при монтировании: приоритет серверных initialCourses над persist при отличии набора id
  useEffect(() => {
    const hasServerData = initialCourses != null;
    const idsDiffer = currentCourseIdsKey !== initialCourseIdsKey;

    if (hasServerData && (!allCourses || idsDiffer)) {
      setAllCourses(initialCourses, "server");
    } else if (initialError && !allCourses) {
      // Ошибка будет обработана в store
    } else if (!initialCourses && !allCourses && !loading.all && userId) {
      fetchAllCourses().catch((error) => {
        reportClientError(error, {
          issueKey: "CoursesClient",
          keys: { operation: "fetch_all_courses" },
        });
        // Ошибка уже обрабатывается в store
      });
    }
  }, [
    initialCourses,
    initialError,
    allCourses,
    currentCourseIdsKey,
    initialCourseIdsKey,
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

  // Применяем все фильтры и сортировку
  const filteredCourses = useMemo(
    () =>
      filterAndSortCourses(allCoursesData, {
        tab: activeTab,
        level: activeLevel,
        progress: activeProgress,
        rating: activeRating,
        search: searchQuery,
        sorting: activeSorting,
      }),
    [
      allCoursesData,
      activeTab,
      activeLevel,
      activeProgress,
      activeRating,
      searchQuery,
      activeSorting,
    ],
  );

  // Функция для получения количества результатов по фильтрам (для preview в drawer)
  const getResultsCount = useCallback(
    (filters: {
      tab: CourseTabType;
      level: TrainingLevelType;
      progress: ProgressFilterType;
      rating: RatingFilterType;
    }) =>
      filterAndSortCourses(allCoursesData, {
        tab: filters.tab,
        level: filters.level,
        progress: filters.progress,
        rating: filters.rating,
        search: searchQuery,
        sorting: activeSorting,
      }).length,
    [allCoursesData, searchQuery, activeSorting],
  );

  const dailyCourseProgressPercent = useMemo(
    () =>
      initialDailyCourse?.stepsSummary.total
        ? Math.round(
            (initialDailyCourse.stepsSummary.completed / initialDailyCourse.stepsSummary.total) *
              100,
          )
        : 0,
    [initialDailyCourse],
  );

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

  return (
    <div className={styles.container}>
      {/* Индикатор синхронизации */}
      <SyncStatusIndicator className={styles.syncIndicator} />

      {initialDailyCourse?.scheduleId && initialDailyCourse.day && (
        <section
          className={styles.dailyCourseSection}
          aria-label="Курс дня"
          data-tour-target="daily-course-card"
        >
          <Link
            href={`/daily-course/${initialDailyCourse.scheduleId}`}
            className={styles.dailyCourseCard}
          >
            <div className={styles.dailyCourseMedia}>
              <Image
                src={DAILY_COURSE_LOGO.url}
                alt={DAILY_COURSE_LOGO.alt}
                width={245}
                height={140}
                className={styles.dailyCourseImage}
                priority
              />
            </div>
            <div className={styles.dailyCourseContent}>
              <div className={styles.dailyCourseHeader}>
                <span className={styles.dailyCoursePill}>Обновляется ежедневно</span>
              </div>
              <p className={styles.dailyCourseDescription}>
                Каждый день — новая короткая связка упражнений для спокойного прогресса с собакой.
              </p>
              <div className={styles.dailyCourseProgressRow}>
                <span>{initialDailyCourse.day.stepsCount} упражнения</span>
                <span>
                  {initialDailyCourse.stepsSummary.completed}/
                  {initialDailyCourse.stepsSummary.total} выполнено
                </span>
              </div>
              <div className={styles.dailyCourseProgressTrack} aria-hidden="true">
                <span
                  className={styles.dailyCourseProgressFill}
                  style={{ width: `${dailyCourseProgressPercent}%` }}
                />
              </div>
            </div>
          </Link>
        </section>
      )}

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
      <section className={styles.coursesSection} aria-label="Список курсов">
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
      </section>

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

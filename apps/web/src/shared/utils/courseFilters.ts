import type { CourseWithProgressData } from "@gafus/types";
import { TrainingStatus } from "@gafus/types";
import type { CourseTabType } from "@features/courses/components/CourseTabs/CourseTabs";
import type {
  TrainingLevelType,
  ProgressFilterType,
  SortingType,
  RatingFilterType,
} from "@features/courses/components/CourseFilters";

// Фильтрация по табам (Все / Бесплатные / Платные / Приватные)
export function filterCoursesByTab(
  courses: CourseWithProgressData[],
  tab: CourseTabType,
): CourseWithProgressData[] {
  switch (tab) {
    case "all":
      return courses;
    case "free":
      return courses.filter((course) => !course.isPrivate && !course.isPaid);
    case "paid":
      return courses.filter((course) => course.isPaid);
    case "private":
      return courses.filter((course) => course.isPrivate);
    default:
      return courses;
  }
}

// Фильтрация по уровню сложности
export function filterCoursesByLevel(
  courses: CourseWithProgressData[],
  level: TrainingLevelType,
): CourseWithProgressData[] {
  if (level === "ALL") return courses;
  return courses.filter((course) => course.trainingLevel === level);
}

// Фильтрация по прогрессу пользователя
export function filterCoursesByProgress(
  courses: CourseWithProgressData[],
  status: ProgressFilterType,
): CourseWithProgressData[] {
  if (status === "ALL") return courses;
  return courses.filter((course) => course.userStatus === status);
}

// Фильтрация по рейтингу
export function filterCoursesByRating(
  courses: CourseWithProgressData[],
  rating: RatingFilterType,
): CourseWithProgressData[] {
  switch (rating) {
    case "4+":
      return courses.filter((course) => course.avgRating !== null && course.avgRating >= 4);
    case "3+":
      return courses.filter((course) => course.avgRating !== null && course.avgRating >= 3);
    case "ANY":
      return courses.filter((course) => course.avgRating !== null);
    case "ALL":
    default:
      return courses;
  }
}

// Фильтрация по поисковому запросу
export function filterCoursesBySearch(
  courses: CourseWithProgressData[],
  searchQuery: string,
): CourseWithProgressData[] {
  if (!searchQuery.trim()) return courses;

  const query = searchQuery.toLowerCase().trim();

  return courses.filter(
    (course) =>
      course.name.toLowerCase().includes(query) ||
      course.description.toLowerCase().includes(query) ||
      course.shortDesc.toLowerCase().includes(query) ||
      course.authorUsername.toLowerCase().includes(query),
  );
}

// Сортировка курсов
export function sortCourses(
  courses: CourseWithProgressData[],
  sorting: SortingType,
): CourseWithProgressData[] {
  switch (sorting) {
    case "newest":
      return courses.toSorted(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    case "rating":
      return courses.toSorted((a, b) => {
        const ratingA = a.avgRating ?? 0;
        const ratingB = b.avgRating ?? 0;
        return ratingB - ratingA;
      });

    case "name":
      return courses.toSorted((a, b) => a.name.localeCompare(b.name, "ru"));

    case "progress": {
      const statusOrder = {
        [TrainingStatus.COMPLETED]: 0,
        [TrainingStatus.IN_PROGRESS]: 1,
        [TrainingStatus.NOT_STARTED]: 2,
      };
      return courses.toSorted(
        (a, b) => statusOrder[a.userStatus] - statusOrder[b.userStatus],
      );
    }

    default:
      return [...courses];
  }
}

// Комбинированная функция фильтрации и сортировки
export function filterAndSortCourses(
  courses: CourseWithProgressData[],
  filters: {
    tab: CourseTabType;
    level: TrainingLevelType;
    progress: ProgressFilterType;
    rating: RatingFilterType;
    search: string;
    sorting: SortingType;
  },
): CourseWithProgressData[] {
  let result = courses;

  // Применяем фильтры последовательно
  result = filterCoursesByTab(result, filters.tab);
  result = filterCoursesByLevel(result, filters.level);
  result = filterCoursesByProgress(result, filters.progress);
  result = filterCoursesByRating(result, filters.rating);
  result = filterCoursesBySearch(result, filters.search);

  // Применяем сортировку
  result = sortCourses(result, filters.sorting);

  return result;
}

// Подсчёт курсов по табам
export function getTabCounts(courses: CourseWithProgressData[]): Record<CourseTabType, number> {
  return {
    all: courses.length,
    free: courses.filter((course) => !course.isPrivate && !course.isPaid).length,
    paid: courses.filter((course) => course.isPaid).length,
    private: courses.filter((course) => course.isPrivate).length,
  };
}

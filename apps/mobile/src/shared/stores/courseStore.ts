import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";
import type { Course } from "@/shared/lib/api";
import { CACHE_DURATIONS } from "@/constants";
import type {
  CourseTabType,
  TrainingLevelType,
  ProgressFilterType,
  RatingFilterType,
  SortingType,
  CourseFiltersState,
} from "@/shared/utils/courseFilters";
import { DEFAULT_COURSE_FILTERS } from "@/shared/utils/courseFilters";

const COURSES_FILTERS_STORAGE_KEY = "courses-filters";

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface CourseState {
  cachedCourses: CachedData<Course[]> | null;
  favorites: string[];
  filters: CourseFiltersState;
}

interface CourseActions {
  getCachedCourses: () => { data: Course[] | null; isExpired: boolean };
  setCachedCourses: (courses: Course[]) => void;
  clearCache: () => void;

  addToFavorites: (courseId: string) => void;
  removeFromFavorites: (courseId: string) => void;
  isFavorite: (courseId: string) => boolean;

  setFilter: <K extends keyof CourseFiltersState>(
    key: K,
    value: CourseFiltersState[K],
  ) => void;
  setFilters: (f: Partial<CourseFiltersState>) => void;
  clearFilters: () => void;
  getFilters: () => CourseFiltersState;
}

type CourseStore = CourseState & CourseActions;

/**
 * Store для управления курсами
 * Хранит кэш, избранные и фильтры
 */
export const useCourseStore = create<CourseStore>()(
  persist(
    (set, get) => ({
      cachedCourses: null,
      favorites: [],
      filters: { ...DEFAULT_COURSE_FILTERS },

      /**
       * Получение кэшированных курсов с проверкой актуальности
       */
      getCachedCourses: () => {
        const cached = get().cachedCourses;

        if (!cached) {
          return { data: null, isExpired: true };
        }

        const isExpired = Date.now() - cached.timestamp > CACHE_DURATIONS.MEDIUM;
        return { data: cached.data, isExpired };
      },

      /**
       * Сохранение курсов в кэш
       */
      setCachedCourses: (courses) => {
        set({
          cachedCourses: {
            data: courses,
            timestamp: Date.now(),
          },
        });
      },

      /**
       * Очистка кэша курсов
       */
      clearCache: () => {
        set({ cachedCourses: null });
      },

      /**
       * Добавление курса в избранное
       */
      addToFavorites: (courseId) => {
        set((state) => ({
          favorites: [...new Set([...(state.favorites || []), courseId])],
        }));
      },

      /**
       * Удаление курса из избранного
       */
      removeFromFavorites: (courseId) => {
        set((state) => ({
          favorites: (state.favorites || []).filter((id) => id !== courseId),
        }));
      },

      /**
       * Проверка, находится ли курс в избранном
       */
      isFavorite: (courseId) => {
        const favs = get().favorites;
        return Array.isArray(favs) && favs.includes(courseId);
      },

      setFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
        }));
      },

      setFilters: (f) => {
        set((state) => ({
          filters: { ...state.filters, ...f },
        }));
      },

      clearFilters: () => {
        set({ filters: { ...DEFAULT_COURSE_FILTERS } });
      },

      getFilters: () => get().filters,
    }),
    {
      name: "course-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        favorites: Array.isArray(state.favorites) ? state.favorites : [],
        filters: state.filters,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<CourseState>)
            : {};
        const merged = {
          ...currentState,
          ...persisted,
        } as CourseState;
        if (!Array.isArray(merged.favorites)) merged.favorites = [];
        if (!merged.filters || typeof merged.filters !== "object") {
          merged.filters = { ...DEFAULT_COURSE_FILTERS };
        }
        const f = merged.filters as unknown as Record<string, unknown>;
        const validTab = ["all", "free", "paid", "private"].includes(
          (f.tab as string) ?? "",
        );
        const validLevel = ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].includes(
          (f.level as string) ?? "",
        );
        const validProgress = ["ALL", "NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED"].includes(
          (f.progress as string) ?? "",
        );
        const validRating = ["ALL", "4+", "3+", "ANY"].includes(
          (f.rating as string) ?? "",
        );
        const validSorting = ["newest", "rating", "name", "progress"].includes(
          (f.sorting as string) ?? "",
        );
        merged.filters = {
          tab: validTab ? (f.tab as CourseTabType) : DEFAULT_COURSE_FILTERS.tab,
          level: validLevel ? (f.level as TrainingLevelType) : DEFAULT_COURSE_FILTERS.level,
          progress: validProgress ? (f.progress as ProgressFilterType) : DEFAULT_COURSE_FILTERS.progress,
          rating: validRating ? (f.rating as RatingFilterType) : DEFAULT_COURSE_FILTERS.rating,
          search: typeof f.search === "string" ? f.search : DEFAULT_COURSE_FILTERS.search,
          sorting: validSorting ? (f.sorting as SortingType) : DEFAULT_COURSE_FILTERS.sorting,
        };
        return merged as CourseStore;
      },
    },
  ),
);

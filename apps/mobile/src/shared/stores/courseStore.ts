import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";
import type { Course } from "@/shared/lib/api";
import { CACHE_DURATIONS } from "@/constants";

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface CourseState {
  // Кэш списка курсов
  cachedCourses: CachedData<Course[]> | null;
  // Избранные курсы (ID)
  favorites: string[];
  // Выбранные фильтры
  filters: {
    type: string | null;
    level: string | null;
    search: string;
  };
}

interface CourseActions {
  // Кэширование
  getCachedCourses: () => { data: Course[] | null; isExpired: boolean };
  setCachedCourses: (courses: Course[]) => void;
  clearCache: () => void;

  // Избранное
  addToFavorites: (courseId: string) => void;
  removeFromFavorites: (courseId: string) => void;
  isFavorite: (courseId: string) => boolean;

  // Фильтры
  setFilter: (key: "type" | "level" | "search", value: string | null) => void;
  clearFilters: () => void;
}

type CourseStore = CourseState & CourseActions;

/**
 * Store для управления курсами
 * Хранит кэш, избранные и фильтры
 */
export const useCourseStore = create<CourseStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      cachedCourses: null,
      favorites: [],
      filters: {
        type: null,
        level: null,
        search: "",
      },

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

      /**
       * Установка фильтра
       */
      setFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
        }));
      },

      /**
       * Сброс всех фильтров
       */
      clearFilters: () => {
        set({
          filters: { type: null, level: null, search: "" },
        });
      },
    }),
    {
      name: "course-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        favorites: Array.isArray(state.favorites) ? state.favorites : [],
        // Не персистим кэш — он должен быть свежим при каждом запуске
      }),
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...persistedState };
        // Гарантируем, что favorites всегда массив
        if (!Array.isArray(merged.favorites)) {
          merged.favorites = [];
        }
        return merged;
      },
    },
  ),
);

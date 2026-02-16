import {
  getAuthoredCoursesAction,
  getCoursesWithProgressAction,
  getFavoritesCoursesAction,
} from "@shared/server-actions";
import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";

import type { CourseReview, CourseWithProgressData } from "@gafus/types";
import type { CourseStore } from "./types";
import { TrainingStatus } from "@gafus/types";

const logger = createWebLogger("web");

// ===== КОНСТАНТЫ =====
const IMAGE_CACHE_DURATION = 30 * 60 * 1000; // 30 минут для изображений
const COURSES_CACHE_DURATION = 5 * 60 * 1000; // 5 минут для курсов - синхронизируем с серверным кэшем

const isStale = (timestamp: number, maxAge: number = IMAGE_CACHE_DURATION) => {
  return Date.now() - timestamp > maxAge;
};

// ===== STORE =====
export const useCourseStore = create<CourseStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние (упрощено: убрано кэширование списков курсов)
      allCourses: null,
      favorites: null,
      authored: null,
      favoriteCourseIds: new Set<string>(),
      loading: {
        all: false,
        favorites: false,
        authored: false,
      },
      errors: {
        all: null,
        favorites: null,
        authored: null,
      },
      imageCache: {},
      courseStats: {},
      prefetchedCourses: new Set(),

      // ===== ДЕЙСТВИЯ ДЛЯ КУРСОВ =====
      // Упрощено: храним только последние загруженные данные без TTL
      setAllCourses: (courses, type) => {
        const state = get();
        let updatedFavoriteIds = state.favoriteCourseIds;

        if (type === "all" && courses.length > 0) {
          const existingFavoriteIds = courses
            .filter((course: { isFavorite: boolean }) => course.isFavorite)
            .map((course: { id: string }) => course.id);

          updatedFavoriteIds = new Set([...state.favoriteCourseIds, ...existingFavoriteIds]);
        }

        set({
          allCourses: {
            data: courses,
            timestamp: Date.now(),
            type,
          },
          favoriteCourseIds: updatedFavoriteIds,
          errors: { ...get().errors, all: null },
        });
      },

      setFavorites: (courses) => {
        const favoriteIds = new Set(courses.map((course: { id: string }) => course.id));

        set({
          favorites: {
            data: courses,
            timestamp: Date.now(),
          },
          favoriteCourseIds: favoriteIds,
          errors: { ...get().errors, favorites: null },
        });
      },

      setAuthored: (courses) => {
        set({
          authored: courses,
          errors: { ...get().errors, authored: null },
        });
      },

      // ===== ДЕЙСТВИЯ ДЛЯ ИЗБРАННОГО =====
      addToFavorites: (courseId) => {
        const state = get();
        const newFavorites = new Set([...state.favoriteCourseIds, courseId]);
        set({ favoriteCourseIds: newFavorites });

        // Обновляем кэш избранных курсов, если он есть
        if (state.favorites?.data) {
          const updatedFavorites = state.favorites.data.filter(
            (course) => course.id === courseId || state.favoriteCourseIds.has(course.id),
          );
          set({ favorites: { ...state.favorites, data: updatedFavorites } });
        }

        // Отправляем глобальное событие для синхронизации между страницами
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("favoritesChanged", {
              detail: { courseId, action: "add" },
            }),
          );
        }
      },

      removeFromFavorites: (courseId) => {
        const state = get();
        const newFavorites = new Set(
          [...state.favoriteCourseIds].filter((id: string) => id !== courseId),
        );
        set({ favoriteCourseIds: newFavorites });

        // Обновляем кэш избранных курсов, если он есть
        if (state.favorites?.data) {
          const updatedFavorites = state.favorites.data.filter(
            (course) => course.id !== courseId && state.favoriteCourseIds.has(course.id),
          );
          set({ favorites: { ...state.favorites, data: updatedFavorites } });
        }

        // Отправляем глобальное событие для синхронизации между страницами
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("favoritesChanged", {
              detail: { courseId, action: "remove" },
            }),
          );
        }
      },

      isFavorite: (courseId) => {
        const state = get();
        return state.favoriteCourseIds.has(courseId);
      },

      setFavoriteCourseIds: (courseIds) => {
        set({ favoriteCourseIds: new Set(courseIds) });
      },

      // ===== ДЕЙСТВИЯ ДЛЯ ЗАГРУЗКИ =====
      setLoading: (key, loading) => {
        set({
          loading: { ...get().loading, [key]: loading },
        });
      },

      setError: (key, error) => {
        set({
          errors: { ...get().errors, [key]: error },
        });
      },

      // ===== ДЕЙСТВИЯ ДЛЯ ИЗОБРАЖЕНИЙ =====
      markImageLoaded: (url) => {
        const state = get();
        set({
          imageCache: {
            ...state.imageCache,
            [url]: {
              loaded: true,
              timestamp: Date.now(),
              error: false,
            },
          },
        });
      },

      markImageError: (url) => {
        const state = get();
        set({
          imageCache: {
            ...state.imageCache,
            [url]: {
              loaded: false,
              timestamp: Date.now(),
              error: true,
            },
          },
        });
      },

      isImageCached: (url) => {
        const state = get();
        const cached = state.imageCache[url];
        return cached && !isStale(cached.timestamp, IMAGE_CACHE_DURATION) && cached.loaded;
      },

      // ===== ДЕЙСТВИЯ ДЛЯ СТАТИСТИКИ =====
      setCourseStats: (stats) => {
        set({
          courseStats: {
            ...get().courseStats,
            ...stats,
          },
        });
      },

      getCourseStats: () => {
        const state = get();
        const stats = state.courseStats;
        return stats && Object.keys(stats).length > 0 ? stats : {};
      },

      // ===== ДЕЙСТВИЯ ДЛЯ ПРЕФЕТЧИНГА =====
      markPrefetched: (courseId) => {
        const state = get();
        set({
          prefetchedCourses: new Set([...state.prefetchedCourses, courseId]),
        });
      },

      isPrefetched: (courseId) => {
        const state = get();
        return state.prefetchedCourses.has(courseId);
      },

      // ===== УПРОЩЕННЫЕ УТИЛИТЫ =====
      // Упрощено: храним данные без TTL проверок
      syncWithSWR: (key, data) => {
        if (key === "all" && data) {
          get().setAllCourses(data, "all");
        } else if (key === "favorites" && data) {
          get().setFavorites(data);
        } else if (key === "authored" && data) {
          get().setAuthored(data);
        }
      },

      invalidateCache: (key) => {
        set({
          errors: { ...get().errors, [key]: null },
        });
      },

      invalidateFavoritesCache: () => {
        set({
          favorites: null,
          errors: { ...get().errors, favorites: null },
        });
      },

      isStale: () => {
        // Упрощено: всегда считаем данные актуальными (нет TTL)
        return false;
      },

      getCourseById: (courseId) => {
        const state = get();
        if (state.allCourses?.data) {
          const course = state.allCourses.data.find((c) => c.id === courseId);
          if (course) return course;
        }
        if (state.favorites?.data) {
          const course = state.favorites.data.find((c) => c.id === courseId);
          if (course) return course;
        }
        if (state.authored) {
          const course = state.authored.find((c) => c.id === courseId);
          if (course) return course;
        }
        return null;
      },

      getPopularCourses: (limit = 10) => {
        const state = get();
        const courses = state.allCourses?.data || [];
        return courses
          .map((course) => ({
            ...course,
            popularity:
              (state.courseStats[course.id]?.views || 0) *
              (state.courseStats[course.id]?.rating || 1),
          }))
          .toSorted((a, b) => b.popularity - a.popularity)
          .slice(0, limit)
          .map(({ popularity: _popularity, ...course }) => course);
      },

      clearCache: () => {
        set({
          allCourses: null,
          favorites: null,
          authored: null,
          imageCache: {},
          prefetchedCourses: new Set(),
        });
      },
    }),
    {
      name: "course-store",
      partialize: (state) => ({
        // Упрощено: сохраняем данные без TTL проверок
        allCourses: state.allCourses,
        favorites: state.favorites,
        authored: state.authored,
        favoriteCourseIds: Array.from(state.favoriteCourseIds),
        imageCache: state.imageCache,
        courseStats: state.courseStats,
        prefetchedCourses: Array.from(state.prefetchedCourses),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Восстанавливаем Set из массива
          if (Array.isArray(state.favoriteCourseIds)) {
            state.favoriteCourseIds = new Set(state.favoriteCourseIds);
          }

          // Синхронизируем с актуальными данными из stepStore
          // Используем setTimeout чтобы избежать циклических зависимостей
          setTimeout(async () => {
            try {
              const { syncCourseStoreWithStepStates } = await import("@shared/utils/cacheManager");
              await syncCourseStoreWithStepStates();
            } catch (error) {
              logger.warn("Failed to sync courseStore with stepStates:", {
                error,
                operation: "warn",
              });
            }
          }, 100);
        }
      },
    },
  ),
);

// ===== ДОПОЛНИТЕЛЬНЫЕ ХУКИ =====

/**
 * Хук для загрузки всех курсов с кэшированием
 */
export const useCourseStoreActions = () => {
  const store = useCourseStore();

  const fetchAllCourses = useCallback(async (type?: string) => {
    const st = useCourseStore.getState();
    if (st.allCourses?.data && st.allCourses.type === type) {
      const isDataFresh = !isStale(st.allCourses.timestamp, COURSES_CACHE_DURATION);
      if (isDataFresh) return st.allCourses.data;
    }
    st.setLoading("all", true);
    st.setError("all", null);
    try {
      const { data } = await getCoursesWithProgressAction();
      useCourseStore.getState().setAllCourses(data, type);
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      useCourseStore.getState().setError("all", errorMessage);
      throw error;
    } finally {
      useCourseStore.getState().setLoading("all", false);
    }
  }, []);

  const fetchFavorites = useCallback(async () => {
    const st = useCourseStore.getState();
    if (st.favorites?.data) {
      const isDataFresh = !isStale(st.favorites.timestamp, COURSES_CACHE_DURATION);
      if (isDataFresh) return st.favorites.data;
    }
    st.setLoading("favorites", true);
    st.setError("favorites", null);
    try {
      const { data, favoriteIds } = await getFavoritesCoursesAction();
      const typedData = data as unknown as CourseWithProgressData[];
      useCourseStore.getState().setFavorites(typedData);
      useCourseStore.getState().setFavoriteCourseIds(favoriteIds);
      return typedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      useCourseStore.getState().setError("favorites", errorMessage);
      throw error;
    } finally {
      useCourseStore.getState().setLoading("favorites", false);
    }
  }, []);

  const forceRefreshFavorites = useCallback(async () => {
    const st = useCourseStore.getState();
    st.setLoading("favorites", true);
    st.setError("favorites", null);
    try {
      const { data, favoriteIds } = await getFavoritesCoursesAction();
      const typedData = data as unknown as CourseWithProgressData[];
      useCourseStore.getState().setFavorites(typedData);
      useCourseStore.getState().setFavoriteCourseIds(favoriteIds);
      return typedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      useCourseStore.getState().setError("favorites", errorMessage);
      throw error;
    } finally {
      useCourseStore.getState().setLoading("favorites", false);
    }
  }, []);

  const fetchAuthored = useCallback(async () => {
    const st = useCourseStore.getState();
    st.setLoading("authored", true);
    st.setError("authored", null);
    try {
      const data = await getAuthoredCoursesAction();
      const transformedData = data.map(
        (course: {
          id: string;
          name: string;
          logoImg: string;
          avgRating: number | null;
          reviews?: unknown[];
        }) => ({
          id: course.id,
          name: course.name,
          type: "course",
          description: "",
          shortDesc: "",
          duration: "",
          logoImg: course.logoImg,
          isPrivate: false,
          isPaid: false,
          priceRub: null,
          hasAccess: true,
          avgRating: course.avgRating,
          trainingLevel: "BEGINNER" as const,
          createdAt: new Date(),
          authorUsername: "",
          userStatus: TrainingStatus.NOT_STARTED,
          startedAt: null,
          completedAt: null,
          isFavorite: false,
          reviews: (course.reviews as CourseReview[]) || [],
          userCourses: [],
          dayLinks: [],
        }),
      );
      useCourseStore.getState().setAuthored(transformedData);
      return transformedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      useCourseStore.getState().setError("authored", errorMessage);
      throw error;
    } finally {
      useCourseStore.getState().setLoading("authored", false);
    }
  }, []);

  return {
    fetchAllCourses,
    fetchFavorites,
    forceRefreshFavorites,
    fetchAuthored,
    ...store,
  };
};

import { getAuthoredCourses } from "@shared/lib/course/getAuthoredCourses";
import { getCoursesWithProgress } from "@shared/lib/course/getCourses";
import { getFavoritesCourses } from "@shared/lib/course/getFavoritesCourses";
import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CourseReview, CourseState, CourseWithProgressData } from "@gafus/types";
import { TrainingStatus } from "@gafus/types";

// ===== КОНСТАНТЫ =====
const CACHE_DURATION = 10 * 60 * 1000; // 10 минут для курсов
const IMAGE_CACHE_DURATION = 30 * 60 * 1000; // 30 минут для изображений

const isStale = (timestamp: number, maxAge: number = CACHE_DURATION) => {
  return Date.now() - timestamp > maxAge;
};

// ===== STORE =====
export const useCourseStore = create<CourseState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
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
      setAllCourses: (courses, type) => {
        // Если загружаем все курсы, обновляем состояние избранного для тех курсов, которые есть в избранном
        const state = get();
        let updatedFavoriteIds = state.favoriteCourseIds;

        if (type === "all" && courses.length > 0) {
          // Проверяем, какие курсы из загруженных уже есть в избранном
          const existingFavoriteIds = courses
            .filter((course) => course.isFavorite)
            .map((course) => course.id);

          // Обновляем состояние избранного
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
        // Обновляем список избранных курсов
        const favoriteIds = new Set(courses.map((course) => course.id));

        set({
          favorites: {
            data: courses,
            timestamp: Date.now(),
          },
          favoriteCourseIds: favoriteIds, // Синхронизируем с сервером
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
        const newFavorites = new Set([...state.favoriteCourseIds].filter((id) => id !== courseId));
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

      // ===== SWR ИНТЕГРАЦИЯ =====
      // Синхронизация с SWR кэшем
      syncWithSWR: (key, data) => {
        const state = get();
        switch (key) {
          case "all":
            if (data && !state.isStale(state.allCourses)) {
              state.setAllCourses(data, "all");
            }
            break;
          case "favorites":
            if (data && !state.isStale(state.favorites)) {
              state.setFavorites(data);
            }
            break;
          case "authored":
            if (data) {
              state.setAuthored(data);
            }
            break;
        }
      },

      // Инвалидация кэша
      invalidateCache: (key) => {
        const state = get();
        switch (key) {
          case "all":
            state.setAllCourses([], "all");
            break;
          case "favorites":
            state.setFavorites([]);
            break;
          case "authored":
            state.setAuthored([]);
            break;
        }
      },

      // Инвалидируем кэш избранного при изменении
      invalidateFavoritesCache: () => {
        set({ favorites: null });
      },

      // Проверка актуальности данных
      isStale: (cache, maxAge = CACHE_DURATION) => {
        if (!cache) return true;
        return isStale(cache.timestamp, maxAge);
      },

      getCourseById: (courseId) => {
        const state = get();

        // Ищем в основных курсах
        if (state.allCourses?.data) {
          const course = state.allCourses.data.find((c) => c.id === courseId);
          if (course) return course;
        }

        // Ищем в избранных
        if (state.favorites?.data) {
          const course = state.favorites.data.find((c) => c.id === courseId);
          if (course) return course;
        }

        // Ищем в созданных
        if (state.authored) {
          const course = state.authored.find((c) => c.id === courseId);
          if (course) return course;
        }

        return null;
      },

      getPopularCourses: (limit = 10) => {
        const state = get();
        const courses = state.allCourses?.data || [];

        // Сортируем по просмотрам и рейтингу
        return courses
          .map((course) => ({
            ...course,
            popularity:
              (state.courseStats[course.id]?.views || 0) *
              (state.courseStats[course.id]?.rating || 1),
          }))
          .sort((a, b) => b.popularity - a.popularity)
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

  const fetchAllCourses = useCallback(
    async (type?: string) => {
      // Проверяем кэш
      if (!store.isStale(store.allCourses) && store.allCourses?.type === type) {
        return store.allCourses!.data;
      }

      store.setLoading("all", true);
      store.setError("all", null);

      try {
        const { data } = await getCoursesWithProgress();

        store.setAllCourses(data, type);
        return data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        store.setError("all", errorMessage);
        throw error;
      } finally {
        store.setLoading("all", false);
      }
    },
    [store],
  );

  const fetchFavorites = useCallback(async () => {
    // Проверяем кэш
    if (!store.isStale(store.favorites)) {
      return store.favorites!.data;
    }

    store.setLoading("favorites", true);
    store.setError("favorites", null);

    try {
      const { data, favoriteIds } = await getFavoritesCourses();

      // Приводим к нужному типу
      const typedData = data as unknown as CourseWithProgressData[];
      store.setFavorites(typedData);

      // Синхронизируем ID избранных курсов
      store.setFavoriteCourseIds(favoriteIds);

      return typedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      store.setError("favorites", errorMessage);
      throw error;
    } finally {
      store.setLoading("favorites", false);
    }
  }, [store]);

  // Принудительно обновляем избранное (игнорируя кэш)
  const forceRefreshFavorites = useCallback(async () => {
    store.setLoading("favorites", true);
    store.setError("favorites", null);

    try {
      const { data, favoriteIds } = await getFavoritesCourses();
      const typedData = data as unknown as CourseWithProgressData[];
      store.setFavorites(typedData);

      // Синхронизируем ID избранных курсов
      store.setFavoriteCourseIds(favoriteIds);

      return typedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      store.setError("favorites", errorMessage);
      throw error;
    } finally {
      store.setLoading("favorites", false);
    }
  }, [store]);

  const fetchAuthored = useCallback(async () => {
    // Всегда запрашиваем актуальные данные (важно для корректного статуса COMPLETED)
    store.setLoading("authored", true);
    store.setError("authored", null);

    try {
      const data = await getAuthoredCourses();

      // Преобразуем AuthoredCourse в CourseWithProgressData
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
          type: "course", // дефолтное значение
          description: "", // дефолтное значение
          shortDesc: "", // дефолтное значение
          duration: "", // дефолтное значение
          logoImg: course.logoImg,
          isPrivate: false, // дефолтное значение
          avgRating: course.avgRating,
          createdAt: new Date(), // дефолтное значение
          authorUsername: "", // дефолтное значение
          userStatus: TrainingStatus.NOT_STARTED,
          startedAt: null,
          completedAt: null,
          isFavorite: false,
          reviews: (course.reviews as CourseReview[]) || [],
          userCourses: [],
          dayLinks: [],
        }),
      );

      store.setAuthored(transformedData);
      return transformedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      store.setError("authored", errorMessage);
      throw error;
    } finally {
      store.setLoading("authored", false);
    }
  }, [store]);

  return {
    fetchAllCourses,
    fetchFavorites,
    forceRefreshFavorites,
    fetchAuthored,
    ...store,
  };
};

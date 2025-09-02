"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getAuthoredCourses } from "@shared/lib/course/getAuthoredCourses";
import { getCoursesWithProgress } from "@shared/lib/course/getCourses";
import { getFavoritesCourses } from "@shared/lib/course/getFavoritesCourses";
import { useCourseStore } from "@shared/stores/courseStore";

// Хук для курсов с интеграцией SWR + Zustand
export function useCoursesWithStore() {
  const store = useCourseStore();
  const { mutate } = useMutate();

  // Используем SWR для загрузки данных
  const {
    data: swrData,
    error,
    isLoading,
  } = useData("courses:all", () => getCoursesWithProgress().then((result) => result.data), {
    refetchOnWindowFocus: false,
    staleTime: 60000, // 1 минута
  });

  // Инвалидируем кэш
  const invalidateCourses = () => {
    mutate("courses:all");
    store.setAllCourses([], "all");
  };

  // Получаем данные из Zustand или SWR
  const getData = () => {
    if (swrData) return swrData;
    if (store.allCourses && !store.isStale(store.allCourses)) {
      return store.allCourses.data;
    }
    return [];
  };

  return {
    data: getData(),
    error: error || store.errors.all,
    isLoading: isLoading || store.loading.all,
    invalidateCourses,
  };
}

// Хук для избранных курсов
export function useFavoritesWithStore() {
  const store = useCourseStore();
  const { mutate } = useMutate();

  const {
    data: swrData,
    error,
    isLoading,
  } = useData("courses:favorites", () => getFavoritesCourses().then((result) => result.data), {
    refetchOnWindowFocus: false,
    staleTime: 300000, // 5 минут
  });

  const invalidateFavorites = () => {
    mutate("courses:favorites");
    store.setFavorites([]);
  };

  const getData = () => {
    if (swrData) return swrData;
    if (store.favorites && !store.isStale(store.favorites)) {
      return store.favorites.data;
    }
    return [];
  };

  return {
    data: getData(),
    error: error || store.errors.favorites,
    isLoading: isLoading || store.loading.favorites,
    invalidateFavorites,
  };
}

// Хук для авторских курсов
export function useAuthoredWithStore() {
  const store = useCourseStore();
  const { mutate } = useMutate();

  const {
    data: swrData,
    error,
    isLoading,
  } = useData("courses:authored", () => getAuthoredCourses(), {
    refetchOnWindowFocus: false,
    staleTime: 300000, // 5 минут
  });

  const invalidateAuthored = () => {
    mutate("courses:authored");
    store.setAuthored([]);
  };

  const getData = () => {
    if (swrData) return swrData;
    if (store.authored) {
      return store.authored;
    }
    return [];
  };

  return {
    data: getData(),
    error: error || store.errors.authored,
    isLoading: isLoading || store.loading.authored,
    invalidateAuthored,
  };
}

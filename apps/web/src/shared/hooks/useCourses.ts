"use client";

import { useCourseStoreActions } from "@shared/stores/courseStore";
import { useEffect } from "react";
import { isOnline } from "@shared/utils/offlineCacheUtils";

// CourseWithProgressData больше не импортируется напрямую, используется через courseStore

// CourseWithUserData больше не используется

export function useCourses() {
  const store = useCourseStoreActions();
  
  // Автоматически загружаем данные если их нет
  useEffect(() => {
    if (!store.allCourses && !store.loading.all) {
      if (!isOnline()) return; // офлайн — не инициируем сеть
      store.fetchAllCourses().catch(() => {
        // Ошибка уже обрабатывается в store
      });
    }
  }, [store]);

  return {
    data: store.allCourses?.data || [],
    error: store.errors.all,
    isLoading: store.loading.all,
    refetch: store.fetchAllCourses,
  };
}

export function useFavorites() {
  const store = useCourseStoreActions();
  
  // Автоматически загружаем данные если их нет
  useEffect(() => {
    if (!store.favorites && !store.loading.favorites) {
      if (!isOnline()) return; // офлайн — не инициируем сеть
      store.fetchFavorites().catch(() => {
        // Ошибка уже обрабатывается в store
      });
    }
  }, [store]);

  return {
    data: store.favorites?.data || [],
    error: store.errors.favorites,
    isLoading: store.loading.favorites,
    refetch: store.fetchFavorites,
  };
}

export function useAuthored() {
  const store = useCourseStoreActions();
  
  // Автоматически загружаем данные если их нет
  useEffect(() => {
    if (!store.authored && !store.loading.authored) {
      if (!isOnline()) return; // офлайн — не инициируем сеть
      store.fetchAuthored().catch(() => {
        // Ошибка уже обрабатывается в store
      });
    }
  }, [store]);

  return {
    data: store.authored || [],
    error: store.errors.authored,
    isLoading: store.loading.authored,
    refetch: store.fetchAuthored,
  };
}

export function useCoursesMutation() {
  const store = useCourseStoreActions();

  const invalidateAllCourses = () => {
    store.fetchAllCourses();
  };

  const invalidateFavorites = () => {
    store.fetchFavorites();
  };

  const invalidateAuthored = () => {
    store.fetchAuthored();
  };

  const invalidateAll = () => {
    invalidateAllCourses();
    invalidateFavorites();
    invalidateAuthored();
  };

  return {
    invalidateAllCourses,
    invalidateFavorites,
    invalidateAuthored,
    invalidateAll,
  };
}

"use client";


import { createWebLogger } from "@gafus/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useOfflineStore } from "@shared/stores/offlineStore";
import { useCourseStore } from "@shared/stores/courseStore";
import { getFavoritesCourses } from "@shared/lib/course/getFavoritesCourses";

import type { FavoriteToggleData, CourseWithProgressData } from "@gafus/types";

const logger = createWebLogger('web');

// Локальный хелпер быстрого таймаута для сетевых вызовов в избранном
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

interface FavoritesState {
  favoriteIds: Set<string>;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  // selectors
  isFavorite: (courseId: string) => boolean;

  // mutations
  addFavoriteLocal: (courseId: string) => void;
  removeFavoriteLocal: (courseId: string) => void;
  setFromServer: (ids: string[]) => void;

  // async actions
  loadFromServer: () => Promise<void>;
  addFavorite: (courseId: string) => Promise<void>;
  removeFavorite: (courseId: string) => Promise<void>;
  syncWithServer: () => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteIds: new Set<string>(),
      initialized: false,
      loading: false,
      error: null,

      isFavorite: (courseId: string) => get().favoriteIds.has(courseId),

      addFavoriteLocal: (courseId: string) => {
        const current = get().favoriteIds;
        if (current.has(courseId)) return;
        const next = new Set(current);
        next.add(courseId);
        set({ favoriteIds: next });

        // Обновляем связанный courseStore для обратной совместимости
        try {
          useCourseStore.getState().setFavoriteCourseIds(Array.from(next));
          const all = useCourseStore.getState().allCourses?.data || [];
          if (all.length > 0) {
            const updatedFavorites = all.filter((c: { id: string }) => next.has(c.id));
            useCourseStore
              .getState()
              .setFavorites(updatedFavorites as unknown as CourseWithProgressData[]);
          }
        } catch (e) {
          // noop
        }
      },

      removeFavoriteLocal: (courseId: string) => {
        const current = get().favoriteIds;
        if (!current.has(courseId)) return;
        const next = new Set(current);
        next.delete(courseId);
        set({ favoriteIds: next });

        // Обновляем связанный courseStore для обратной совместимости
        try {
          useCourseStore.getState().setFavoriteCourseIds(Array.from(next));
          const all = useCourseStore.getState().allCourses?.data || [];
          if (all.length > 0) {
            const updatedFavorites = all.filter((c: { id: string }) => next.has(c.id));
            useCourseStore
              .getState()
              .setFavorites(updatedFavorites as unknown as CourseWithProgressData[]);
          }
        } catch (e) {
          // noop
        }
      },

      setFromServer: (ids: string[]) => {
        const next = new Set(ids);
        set({ favoriteIds: next, initialized: true, error: null });
        try {
          useCourseStore.getState().setFavoriteCourseIds(Array.from(next));
          const all = useCourseStore.getState().allCourses?.data || [];
          if (all.length > 0) {
            const updatedFavorites = all.filter((c: { id: string }) => next.has(c.id));
            useCourseStore
              .getState()
              .setFavorites(updatedFavorites as unknown as CourseWithProgressData[]);
          }
        } catch (e) {
          // noop
        }
      },

      loadFromServer: async () => {
        // загружаем ids с сервера один раз или по требованию
        if (get().loading) return;
        
        // Проверяем, что мы в браузере и роутер инициализирован
        if (typeof window === 'undefined') return;
        
        // Проверяем авторизацию через клиентскую сессию
        try {
          const { getSession } = await import("next-auth/react");
          const session = await getSession();
          if (!session?.user) {
            // Пользователь не авторизован, не загружаем избранные
            return;
          }
        } catch (e) {
          // Если не можем проверить сессию, не загружаем
          return;
        }
        
        set({ loading: true, error: null });
        try {
          const { data, favoriteIds } = await getFavoritesCourses();
          get().setFromServer(favoriteIds);
          // если сервер вернул готовые данные — используем их для courseStore
          try {
            useCourseStore
              .getState()
              .setFavorites(data as unknown as CourseWithProgressData[]);
          } catch (e) {
            // noop
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unknown error";
          set({ error: message });
        } finally {
          set({ loading: false });
        }
      },

      addFavorite: async (courseId: string) => {
        const { isOnline, addToSyncQueue } = useOfflineStore.getState();
        // локально сразу
        get().addFavoriteLocal(courseId);

        const doRequest = async () => {
          const { addFavoriteCourse } = await import("@shared/lib/course/addtoFavorite");
          await addFavoriteCourse(courseId);
        };

        // онлайн — шлём с увеличенным таймаутом и мягким ретраем, офлайн — в очередь
        if (isOnline) {
          try {
            await withTimeout(doRequest(), 2500);
          } catch (e) {
            // Не кидаем сразу в офлайн-очередь — пробуем фоновые ретраи
            logger.warn("addFavorite online attempt failed, retrying in background", { error: e, operation: 'warn' });
            (async () => {
              for (let i = 0; i < 2; i++) {
                try {
                  await withTimeout(doRequest(), 2500);
                  return;
                } catch (err) {
                  logger.warn("addFavorite retry failed", { error: err, operation: 'warn' });
                }
              }
              // Если так и не удалось — только тогда кладём в очередь
              const data: FavoriteToggleData = { courseId, action: "add" };
              addToSyncQueue({ type: "favorite-toggle", data, maxRetries: 3 });
            })();
          }
        } else {
          const data: FavoriteToggleData = { courseId, action: "add" };
          addToSyncQueue({ type: "favorite-toggle", data, maxRetries: 3 });
        }
      },

      removeFavorite: async (courseId: string) => {
        const { isOnline, addToSyncQueue } = useOfflineStore.getState();
        // локально сразу
        get().removeFavoriteLocal(courseId);

        const doRequest = async () => {
          const { removeFavoriteCourse } = await import("@shared/lib/course/addtoFavorite");

// Создаем логгер для favorites-store
const logger = createWebLogger('web-favorites-store');
          await removeFavoriteCourse(courseId);
        };

        if (isOnline) {
          try {
            await withTimeout(doRequest(), 2500);
          } catch (e) {
            logger.warn("removeFavorite online attempt failed, retrying in background", { error: e, operation: 'warn' });
            (async () => {
              for (let i = 0; i < 2; i++) {
                try {
                  await withTimeout(doRequest(), 2500);
                  return;
                } catch (err) {
                  logger.warn("removeFavorite retry failed", { error: err, operation: 'warn' });
                }
              }
              const data: FavoriteToggleData = { courseId, action: "remove" };
              addToSyncQueue({ type: "favorite-toggle", data, maxRetries: 3 });
            })();
          }
        } else {
          const data: FavoriteToggleData = { courseId, action: "remove" };
          addToSyncQueue({ type: "favorite-toggle", data, maxRetries: 3 });
        }
      },

      syncWithServer: async () => {
        // простая стратегия: перезагружаем ids с сервера и объединяем
        try {
          const { favoriteIds: serverIds } = await getFavoritesCourses();
          // объединяем локальные и серверные (локальный — источник правды)
          const local = get().favoriteIds;
          const merged = new Set<string>([...serverIds, ...Array.from(local)]);
          get().setFromServer(Array.from(merged));
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unknown error";
          set({ error: message });
        }
      },
    }),
    {
      name: "favorites-store",
      partialize: (state) => ({
        favoriteIds: Array.from(state.favoriteIds),
        initialized: state.initialized,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const s = state as unknown as { favoriteIds?: unknown };
        if (Array.isArray(s.favoriteIds)) {
          // восстановление Set из массива
          (s as unknown as FavoritesState).favoriteIds = new Set(
            s.favoriteIds as string[],
          );
        }
        // после ре-гидратации подгружаем актуальные данные с сервера в фоне
        // Используем requestIdleCallback для отложенной загрузки после инициализации роутера
        const loadWhenReady = () => {
          try {
            useFavoritesStore.getState().loadFromServer();
          } catch (e) {
            // noop
          }
        };

        if (typeof window !== 'undefined') {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadWhenReady, { timeout: 1000 });
          } else {
            setTimeout(loadWhenReady, 500);
          }
        }
      },
    },
  ),
);



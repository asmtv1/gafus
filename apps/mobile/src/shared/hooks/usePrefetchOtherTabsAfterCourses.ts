import { useEffect, useRef } from "react";
import { InteractionManager } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { achievementsQueryOptions } from "@/shared/lib/api/achievementsQuery";
import { articlesQueryOptions } from "@/shared/lib/api/articlesQuery";
import { favoritesQueryOptions } from "@/shared/lib/api/favoritesQuery";
import {
  petsQueryOptions,
  pushSubscriptionDeviceStatusQueryOptions,
  studentNotesQueryOptions,
  trainerPublicProfileQueryOptions,
  userProfileQueryOptions,
} from "@/shared/lib/api/profileTabQueries";
import { useAuthStore } from "@/shared/stores";

import { useIsOffline } from "./useNetworkStatus";

const STAGGER_MS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasSuccessData(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
): boolean {
  const state = queryClient.getQueryState(queryKey);
  return state?.status === "success" && state.data !== undefined;
}

interface UsePrefetchOtherTabsAfterCoursesOptions {
  /** Каталог курсов получен (не начальная загрузка и без ошибки запроса). */
  catalogReady: boolean;
}

/**
 * После готовности каталога на вкладке «Курсы» — в фоне наполняет кэш запросов остальных табов,
 * чтобы при переключении не ждать первый fetch (где возможно и есть сеть/сессия).
 */
export function usePrefetchOtherTabsAfterCourses({
  catalogReady,
}: UsePrefetchOtherTabsAfterCoursesOptions): void {
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  const publicDoneRef = useRef(false);
  const authDoneRef = useRef(false);

  useEffect(() => {
    authDoneRef.current = !isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!catalogReady || isOffline) return;

    let cancelled = false;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          if (!publicDoneRef.current) {
            if (!hasSuccessData(queryClient, articlesQueryOptions.queryKey)) {
              await queryClient.prefetchQuery(articlesQueryOptions);
            }
            publicDoneRef.current = true;
          }

          if (cancelled || authLoading) return;

          if (!isAuthenticated) {
            return;
          }

          if (authDoneRef.current) return;

          if (!hasSuccessData(queryClient, favoritesQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(favoritesQueryOptions);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          if (!hasSuccessData(queryClient, achievementsQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(achievementsQueryOptions);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          if (!hasSuccessData(queryClient, userProfileQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(userProfileQueryOptions);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          if (!hasSuccessData(queryClient, petsQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(petsQueryOptions);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          if (!hasSuccessData(queryClient, pushSubscriptionDeviceStatusQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(pushSubscriptionDeviceStatusQueryOptions);
          }

          if (user?.role === "USER") {
            await delay(STAGGER_MS);
            if (cancelled) return;
            if (!hasSuccessData(queryClient, studentNotesQueryOptions.queryKey)) {
              await queryClient.prefetchQuery(studentNotesQueryOptions);
            }
          }

          if (user?.role === "TRAINER" && user.username) {
            await delay(STAGGER_MS);
            if (cancelled) return;
            const trainerOpts = trainerPublicProfileQueryOptions(user.username);
            if (!hasSuccessData(queryClient, trainerOpts.queryKey)) {
              await queryClient.prefetchQuery(trainerOpts);
            }
          }

          authDoneRef.current = true;
        } catch {
          // Префетч не критичен для UX — не засоряем Tracer
        }
      })();
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel?.();
    };
  }, [
    catalogReady,
    isOffline,
    authLoading,
    isAuthenticated,
    user?.role,
    user?.username,
    queryClient,
  ]);
}

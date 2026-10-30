import { useEffect, useMemo, useRef } from "react";
import { InteractionManager } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { achievementsForActor } from "@/shared/lib/api/achievementsQuery";
import { articlesQueryOptions } from "@/shared/lib/api/articlesQuery";
import { favoritesQueryOptions } from "@/shared/lib/api/favoritesQuery";
import {
  petsQueryOptions,
  petListForActor,
  verifiedPetsActor,
  pushDeviceStatusForActor,
  studentNotesQueryOptions,
  trainerPublicProfileQueryOptions,
  userProfileQueryOptions,
} from "@/shared/lib/api/profileTabQueries";
import { useAuthStore } from "@/shared/stores";
import { getVerifiedPushActor } from "@/shared/lib/utils/notifications";

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
  const principalId = isAuthenticated ? (user?.id ?? null) : null;
  const verifiedPushActor = getVerifiedPushActor();
  const verifiedOwnerId = verifiedPushActor?.ownerId ?? null;
  const verifiedEpoch = verifiedPushActor?.authEpoch ?? null;
  const pushActor = useMemo(
    () =>
      verifiedOwnerId && verifiedOwnerId === principalId && verifiedEpoch
        ? { ownerId: verifiedOwnerId, authEpoch: verifiedEpoch }
        : null,
    [verifiedOwnerId, verifiedEpoch, principalId],
  );

  const publicDoneRef = useRef(false);
  const authDoneRef = useRef(false);

  useEffect(() => {
    // Direct USER-A → USER-B keeps isAuthenticated=true, but B has a new
    // private query cache and must receive its own prefetch.
    authDoneRef.current = !principalId;
  }, [principalId, pushActor?.authEpoch]);

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

          if (!principalId) {
            return;
          }

          if (authDoneRef.current) return;

          if (!hasSuccessData(queryClient, favoritesQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(favoritesQueryOptions);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          // Never prefetch private entitlement under the legacy shared ["achievements"] key.
          const scopedAchievements = achievementsForActor(pushActor);
          if (
            pushActor &&
            scopedAchievements.enabled &&
            !hasSuccessData(queryClient, scopedAchievements.queryKey)
          ) {
            await queryClient.prefetchQuery(scopedAchievements);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          if (!hasSuccessData(queryClient, userProfileQueryOptions.queryKey)) {
            await queryClient.prefetchQuery(userProfileQueryOptions);
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          // Global ["pets"] belongs to an exact verified actor/epoch, even for prefetch.
          if (
            pushActor &&
            !petListForActor(
              queryClient.getQueryData(petsQueryOptions.queryKey),
              verifiedPetsActor(),
            )
          ) {
            // Old A/E1 in-flight must not absorb the new A/E2 private prefetch.
            await queryClient.cancelQueries({ queryKey: petsQueryOptions.queryKey, exact: true });
            if (
              !cancelled &&
              verifiedPetsActor()?.ownerId === pushActor.ownerId &&
              verifiedPetsActor()?.authEpoch === pushActor.authEpoch
            ) {
              await queryClient.prefetchQuery(petsQueryOptions);
            }
          }
          await delay(STAGGER_MS);
          if (cancelled) return;

          // Push status belongs to the verified native owner+epoch, not a shared cache.
          const pushOptions = pushDeviceStatusForActor(pushActor);
          if (
            pushActor &&
            pushOptions.enabled &&
            !hasSuccessData(queryClient, pushOptions.queryKey)
          ) {
            await queryClient.prefetchQuery(pushOptions);
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

          if (!cancelled) authDoneRef.current = true;
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
    principalId,
    pushActor,
    user?.role,
    user?.username,
    queryClient,
  ]);
}

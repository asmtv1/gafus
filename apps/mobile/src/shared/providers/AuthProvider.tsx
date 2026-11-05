import { useEffect, useRef, type ReactNode } from "react";
import { useRootNavigationState } from "expo-router";
import { AppState } from "react-native";

import { useQueryClient } from "@tanstack/react-query";

import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore, useCourseStore, useStepStore } from "@/shared/stores";
import { favoritesQueryOptions } from "@/shared/lib/api/favoritesQuery";
import { resetUserStores } from "@/shared/stores/resetAll";
import { flushMobileIntroEvents } from "@/shared/lib/api/mobile-intro";
import { useNetworkStatusStore } from "@/shared/stores/networkStatusStore";
import { Loading } from "@/shared/components/ui/Loading";
import { VerifiedSessionRecovery } from "@/shared/components/VerifiedSessionRecovery";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Провайдер аутентификации — только side effects, без навигации.
 * Навигация по auth состоянию реализована декларативно через <Redirect>
 * в layout-файлах групп (auth) и (main).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const navState = useRootNavigationState();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionEpoch = useAuthStore((state) => state.verifiedSessionEpoch);
  const userId = useAuthStore((state) => state.user?.id);
  const isOffline = useNetworkStatusStore((state) => state.isOffline);
  const isLoading = useAuthStore((state) => state.isLoading);
  const prevAuthRef = useRef<{ authenticated: boolean; userId: string | null } | null>(null);
  const favoritesLoadedRef = useRef<string | null>(null);
  const verified = newOnlyV2NativeQueues.getVerifiedBinding();
  const verifiedEpoch = isAuthenticated && userId && sessionEpoch &&
    verified?.principalId === userId && verified.authEpoch === sessionEpoch
    ? sessionEpoch : null;

  useEffect(() => {
    if (isLoading || isOffline || (isAuthenticated && !verifiedEpoch)) return;
    const retry = () => {
      void flushMobileIntroEvents(isAuthenticated ? userId : undefined).catch(() => undefined);
    };
    retry();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") retry();
    });
    return () => subscription.remove();
  }, [isAuthenticated, isLoading, isOffline, userId, verifiedEpoch]);

  useEffect(() => {
    if (isLoading) return;
    const previous = prevAuthRef.current;
    const principalId = isAuthenticated ? (userId ?? null) : null;
    prevAuthRef.current = { authenticated: isAuthenticated, userId: principalId };

    if (previous?.authenticated && !isAuthenticated) {
      resetUserStores();
    } else if (previous?.authenticated && isAuthenticated && previous.userId !== principalId) {
      // A direct authenticated USER-A → USER-B switch must discard private
      // in-memory queries without deleting native offline files or queues.
      queryClient.clear();
      useCourseStore.setState({ favorites: [] });
    }
  }, [isAuthenticated, isLoading, queryClient, userId]);

  useEffect(() => {
    if (isLoading || (isAuthenticated && !verifiedEpoch)) return;
    void useStepStore.persist.rehydrate();
  }, [isAuthenticated, isLoading, verifiedEpoch]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !verifiedEpoch) {
      favoritesLoadedRef.current = null;
      return;
    }
    const actorKey = `${userId}:${verifiedEpoch}`;
    if (favoritesLoadedRef.current === actorKey) return;
    favoritesLoadedRef.current = actorKey;
    let cancelled = false;

    (async () => {
      try {
        const res = await queryClient.fetchQuery(favoritesQueryOptions);
        // An earlier principal's request can resolve after the user switches.
        // Never copy its private favorites into the next account's store.
        const current = useAuthStore.getState();
        if (cancelled || !current.isAuthenticated || current.user?.id !== userId ||
          newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch !== verifiedEpoch) return;
        const ids = res.data?.favoriteIds;
        if (ids !== undefined) {
          useCourseStore.setState({
            favorites: Array.isArray(ids) ? ids : [],
          });
        }
      } catch (err) {
        const current = useAuthStore.getState();
        if (cancelled || !current.isAuthenticated || current.user?.id !== userId ||
          newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch !== verifiedEpoch) return;
        reportClientError(err, {
          issueKey: "AuthProvider",
          severity: "warning",
          keys: { operation: "fetch_favorites" },
        });
        favoritesLoadedRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, queryClient, userId, verifiedEpoch]);

  if (isLoading || !navState?.key) {
    return <Loading fullScreen />;
  }

  // A cached profile is not enough to enter protected screens after upgrading
  // from an older release. Wait for a server-verified (and migrated) V2 binding;
  // otherwise menus and owner-scoped reads can stay stuck indefinitely.
  if (isAuthenticated && !verifiedEpoch) {
    return <VerifiedSessionRecovery />;
  }

  return <>{children}</>;
}

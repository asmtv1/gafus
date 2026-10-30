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
  const userId = useAuthStore((state) => state.user?.id);
  const isOffline = useNetworkStatusStore((state) => state.isOffline);
  const isLoading = useAuthStore((state) => state.isLoading);
  const prevAuthRef = useRef<{ authenticated: boolean; userId: string | null } | null>(null);
  const favoritesLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || isOffline) return;
    const retry = () => {
      void flushMobileIntroEvents(isAuthenticated ? userId : undefined).catch(() => undefined);
    };
    retry();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") retry();
    });
    return () => subscription.remove();
  }, [isAuthenticated, isLoading, isOffline, userId]);

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
    if (isLoading) return;
    void useStepStore.persist.rehydrate();
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      favoritesLoadedRef.current = null;
      return;
    }
    if (favoritesLoadedRef.current === userId) return;
    favoritesLoadedRef.current = userId;
    let cancelled = false;

    (async () => {
      try {
        const res = await queryClient.fetchQuery(favoritesQueryOptions);
        // An earlier principal's request can resolve after the user switches.
        // Never copy its private favorites into the next account's store.
        const current = useAuthStore.getState();
        if (cancelled || !current.isAuthenticated || current.user?.id !== userId) return;
        const ids = res.data?.favoriteIds;
        if (ids !== undefined) {
          useCourseStore.setState({
            favorites: Array.isArray(ids) ? ids : [],
          });
        }
      } catch (err) {
        const current = useAuthStore.getState();
        if (cancelled || !current.isAuthenticated || current.user?.id !== userId) return;
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
  }, [isAuthenticated, queryClient, userId]);

  if (isLoading || !navState?.key) {
    return <Loading fullScreen />;
  }

  return <>{children}</>;
}

import { useEffect, useRef, type ReactNode } from "react";
import { useRootNavigationState } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { useQueryClient } from "@tanstack/react-query";

import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore, useCourseStore, useStepStore } from "@/shared/stores";
import { favoritesQueryOptions } from "@/shared/lib/api/favoritesQuery";
import { COLORS } from "@/constants";
import { resetUserStores } from "@/shared/stores/resetAll";

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
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const prevAuthRef = useRef<boolean | null>(null);
  const favoritesLoadedRef = useRef(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;
    const prev = prevAuthRef.current;
    prevAuthRef.current = isAuthenticated;
    if (prev === true && !isAuthenticated) {
      resetUserStores();
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    void useStepStore.persist.rehydrate();
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isAuthenticated) {
      favoritesLoadedRef.current = false;
      return;
    }
    if (favoritesLoadedRef.current) return;
    favoritesLoadedRef.current = true;

    (async () => {
      try {
        const res = await queryClient.fetchQuery(favoritesQueryOptions);
        const ids = res.data?.favoriteIds;
        if (ids !== undefined) {
          useCourseStore.setState({
            favorites: Array.isArray(ids) ? ids : [],
          });
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "AuthProvider",
          severity: "warning",
          keys: { operation: "fetch_favorites" },
        });
        favoritesLoadedRef.current = false;
      }
    })();
  }, [isAuthenticated, queryClient]);

  if (isLoading || !navState?.key) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
});

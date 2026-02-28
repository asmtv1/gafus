import { useEffect, useRef, type ReactNode } from "react";
import { useSegments, useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { useQueryClient } from "@tanstack/react-query";

import { useAuthStore, useCourseStore, useStepStore } from "@/shared/stores";
import { favoritesQueryOptions } from "@/shared/lib/api/favoritesQuery";
import { COLORS } from "@/constants";
import { resetUserStores } from "@/shared/stores/resetAll";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Провайдер аутентификации
 * Проверяет auth состояние и редиректит на login/main.
 * При старте сессии загружает избранное (getFavorites) в store — как loadFromServer в web.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, checkAuth, pendingConfirmPhone } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const prevAuthRef = useRef<boolean | null>(null);
  const favoritesLoadedRef = useRef(false);

  // Проверяем авторизацию при монтировании
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Гарантированный сброс всех хранилищ при выходе / истечении сессии
  useEffect(() => {
    if (isLoading) return;

    const prev = prevAuthRef.current;
    prevAuthRef.current = isAuthenticated;

    if (prev === true && !isAuthenticated) {
      resetUserStores();
    }
  }, [isAuthenticated, isLoading]);

  // При смене пользователя (логин/логаут) подгружаем stepStore из ключа по userId
  useEffect(() => {
    if (isLoading) return;
    void useStepStore.persist.rehydrate();
  }, [isAuthenticated, isLoading]);

  // Загрузка избранного при старте — prefetch в React Query и sync в store (единый источник)
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
      } catch {
        favoritesLoadedRef.current = false;
      }
    })();
  }, [isAuthenticated, queryClient]);

  // Редирект на основе auth состояния
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const isConfirmScreen = inAuthGroup && segments[1] === "confirm";

    if (__DEV__) {
      console.log("[AuthProvider] redirect effect", {
        isAuthenticated,
        pendingConfirmPhone,
        segments: [...segments],
        inAuthGroup,
        isConfirmScreen,
      });
    }

    if (pendingConfirmPhone && !isConfirmScreen) {
      if (__DEV__) console.log("[AuthProvider] → replace /confirm");
      router.replace("/confirm");
      return;
    }

    if (!isAuthenticated && !inAuthGroup) {
      if (__DEV__) console.log("[AuthProvider] → replace /welcome");
      router.replace("/welcome");
    } else if (isAuthenticated && inAuthGroup && !isConfirmScreen) {
      if (__DEV__) console.log("[AuthProvider] → replace / (main)");
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, segments, router, pendingConfirmPhone]);

  // Показываем лоадер пока проверяем авторизацию
  if (isLoading) {
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

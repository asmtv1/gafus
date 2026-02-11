import { useEffect, useRef, type ReactNode } from "react";
import { useSegments, useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { useAuthStore, useCourseStore, useStepStore } from "@/shared/stores";
import { coursesApi } from "@/shared/lib/api";
import { COLORS } from "@/constants";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Провайдер аутентификации
 * Проверяет auth состояние и редиректит на login/main.
 * При старте сессии загружает избранное (getFavorites) в store — как loadFromServer в web.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { isAuthenticated, isLoading, checkAuth, pendingConfirmPhone } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const favoritesLoadedRef = useRef(false);

  // Проверяем авторизацию при монтировании
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // При смене пользователя (логин/логаут) подгружаем stepStore из ключа по userId
  useEffect(() => {
    if (isLoading) return;
    void useStepStore.persist.rehydrate();
  }, [isAuthenticated, isLoading]);

  // Загрузка избранного при старте (аналог loadFromServer в web), один раз за сессию
  useEffect(() => {
    if (!isAuthenticated) {
      favoritesLoadedRef.current = false;
      return;
    }
    if (favoritesLoadedRef.current) return;
    favoritesLoadedRef.current = true;

    (async () => {
      try {
        const res = await coursesApi.getFavorites();
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
  }, [isAuthenticated]);

  // Редирект на основе auth состояния
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const isConfirmScreen = inAuthGroup && segments[1] === "confirm";

    if (pendingConfirmPhone && !isConfirmScreen) {
      router.replace("/confirm");
      return;
    }

    if (!isAuthenticated && !inAuthGroup) {
      // Не авторизован и не на странице авторизации — редирект на welcome
      router.replace("/welcome");
    } else if (isAuthenticated && inAuthGroup && !isConfirmScreen) {
      // Авторизован и на странице авторизации — редирект на главную
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

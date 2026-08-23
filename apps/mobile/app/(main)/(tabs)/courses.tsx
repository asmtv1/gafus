import { useState, useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, RefreshControl, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text, Snackbar } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { Loading } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { useCourseStore } from "@/shared/stores";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { favoritesQueryOptions } from "@/shared/lib/api/favoritesQuery";
import { coursesApi, type Course } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { CourseCard } from "@/features/courses";
import { OfflineDownloadedScreen } from "@/features/offline";
import { COLORS, SPACING, FONTS } from "@/shared/config";

/**
 * Страница избранных курсов (логика как в web: список по store).
 * При офлайне показывается экран «Скачанные курсы».
 */
export default function FavoritesScreen() {
  const isOffline = useIsOffline();
  const { favorites, removeFromFavorites, addToFavorites } = useCourseStore(
    useShallow((s) => ({
      favorites: s.favorites,
      removeFromFavorites: s.removeFromFavorites,
      addToFavorites: s.addToFavorites,
    })),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const { data, isLoading, error, refetch } = useQuery(favoritesQueryOptions);

  const payload = data?.data;
  const favoriteIds = useMemo(() => payload?.favoriteIds, [payload]);
  const favoriteCourses = useMemo(() => payload?.data ?? [], [payload]);

  useEffect(() => {
    if (favoriteIds === undefined) return;
    useCourseStore.setState({
      favorites: Array.isArray(favoriteIds) ? favoriteIds : [],
    });
  }, [favoriteIds]);

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const displayedCourses = useMemo(() => {
    return favoriteCourses
      .filter((c) => favoritesSet.has(c.id))
      .sort((a, b) => Number(a.isPaid) - Number(b.isPaid));
  }, [favoriteCourses, favoritesSet]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleUnfavorite = useCallback(
    async (courseId: string) => {
      removeFromFavorites(courseId);
      setPendingIds((prev) => [...prev, courseId]);
      try {
        const res = await coursesApi.toggleFavorite(courseId, "remove");
        if (res.success) await refetch();
        else throw new Error(res.error);
      } catch (err) {
        reportClientError(err instanceof Error ? err : new Error(String(err)), {
          issueKey: "FavoritesScreen",
          keys: { operation: "toggle_favorite" },
        });
        addToFavorites(courseId);
        setSnackbar({
          visible: true,
          message: err instanceof Error ? err.message : "Ошибка удаления из избранного",
        });
      } finally {
        setPendingIds((prev) => prev.filter((id) => id !== courseId));
      }
    },
    [addToFavorites, refetch, removeFromFavorites],
  );

  const pendingIdsSet = useMemo(() => new Set(pendingIds), [pendingIds]);
  const renderCourseItem = useCallback(
    ({ item }: { item: Course }) => (
      <CourseCard
        course={item}
        isFavorite
        onToggleFavorite={handleUnfavorite}
        disabled={pendingIdsSet.has(item.id)}
      />
    ),
    [handleUnfavorite, pendingIdsSet],
  );

  const renderHeader = useCallback(
    () => (
      <View style={styles.headerFilters}>
        <Text style={styles.pageTitle}>Избранные курсы</Text>
      </View>
    ),
    [],
  );

  if (isOffline) {
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <OfflineDownloadedScreen />
      </TexturedSafeAreaView>
    );
  }

  return (
    <TexturedSafeAreaView style={styles.container} edges={["top"]}>
      {isLoading ? (
        <Loading fullScreen embedded message="Загрузка избранных курсов..." />
      ) : error ? (
        <View style={styles.errorContainer}>
          {renderHeader()}
          <Text style={styles.errorText}>
            Ошибка загрузки избранных курсов:{" "}
            {error instanceof Error ? error.message : "Неизвестная ошибка"}
          </Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : displayedCourses.length === 0 ? (
        <View style={styles.emptyContainer}>
          {renderHeader()}
          <Text style={styles.emptyText}>У вас пока нет избранных курсов.</Text>
        </View>
      ) : (
        <FlashList
          data={displayedCourses}
          renderItem={renderCourseItem}
          keyExtractor={(item) => item.id}
          overrideProps={{ estimatedItemSize: 380 }}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerFilters: {
    paddingBottom: SPACING.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352E2E",
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xl,
  },
  errorContainer: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.secondary,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    fontSize: 16,
  },
});

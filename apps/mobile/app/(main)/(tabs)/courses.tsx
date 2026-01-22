import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { Loading } from "@/shared/components/ui";
import { useCourseStore } from "@/shared/stores";
import { coursesApi, type Course } from "@/shared/lib/api";
import { CourseCard } from "@/features/courses/components";
import { COLORS, SPACING, FONTS } from "@/constants";

/**
 * Страница избранных курсов (логика как в web: список по store)
 */
export default function FavoritesScreen() {
  const { favorites, removeFromFavorites, addToFavorites } = useCourseStore();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => coursesApi.getFavorites(),
  });

  const payload = data?.data;
  const favoriteCourses = payload?.data ?? [];

  useEffect(() => {
    const ids = payload?.favoriteIds;
    if (ids === undefined) return;
    useCourseStore.setState({
      favorites: Array.isArray(ids) ? ids : [],
    });
  }, [data]);

  const displayedCourses = useMemo(
    () => favoriteCourses.filter((c) => favorites.includes(c.id)),
    [favoriteCourses, favorites]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleUnfavorite = async (courseId: string) => {
    removeFromFavorites(courseId);
    setPendingIds((prev) => [...prev, courseId]);
    try {
      const res = await coursesApi.toggleFavorite(courseId, "remove");
      if (res.success) await refetch();
      else throw new Error(res.error);
    } catch (err) {
      addToFavorites(courseId);
      setSnackbar({
        visible: true,
        message: err instanceof Error ? err.message : "Ошибка удаления из избранного",
      });
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== courseId));
    }
  };

  const renderCourseItem = ({ item }: { item: Course }) => (
    <CourseCard
      course={item}
      isFavorite
      onToggleFavorite={() => handleUnfavorite(item.id)}
      disabled={pendingIds.includes(item.id)}
    />
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>
        Избранные курсы
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isLoading ? (
        <Loading fullScreen message="Загрузка избранных курсов..." />
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
        <FlatList
          data={displayedCourses}
          renderItem={renderCourseItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: "" })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  title: {
    fontSize: 60,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352E2E",
    textAlign: "center",
    lineHeight: 60,
    letterSpacing: 0,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    padding: SPACING.xl,
    paddingTop: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.secondary,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    padding: SPACING.xxl,
    paddingTop: SPACING.md,
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    fontSize: 16,
  },
});

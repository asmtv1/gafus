import { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Loading } from "@/shared/components/ui";
import { useCourseStore } from "@/shared/stores";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { coursesApi, subscriptionsApi, type Course } from "@/shared/lib/api";
import { setupPushNotifications } from "@/shared/lib/utils/notifications";
import {
  CourseCard,
  CourseSearch,
  CourseFilters,
} from "@/features/courses/components";
import { OfflineDownloadedScreen } from "@/features/offline";
import {
  filterAndSortCourses,
  type CourseTabType,
  type TrainingLevelType,
  type ProgressFilterType,
  type RatingFilterType,
} from "@/shared/utils/courseFilters";
import { COLORS, SPACING, FONTS } from "@/constants";

let pushPromptAskedInSession = false;

/**
 * Страница со всеми курсами: поиск и фильтры как в web.
 * При офлайне показывается экран «Скачанные курсы».
 */
export default function CoursesScreen() {
  const { isOffline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const {
    filters,
    setFilter,
    addToFavorites,
    removeFromFavorites,
    isFavorite,
  } = useCourseStore();

  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["courses"],
    queryFn: () => coursesApi.getAll(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useEffect(() => {
    let cancelled = false;

    const ensurePushSubscription = async () => {
      if (pushPromptAskedInSession) return;
      pushPromptAskedInSession = true;

      const status = await subscriptionsApi.getPushSubscriptionStatus();
      if (cancelled || !status.success || status.data?.hasSubscription) return;

      const ok = await setupPushNotifications();
      if (!cancelled && !ok) {
        setSnackbar({
          visible: true,
          message: "Не удалось включить push-уведомления",
        });
      }
    };

    void ensurePushSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  const allCourses = data?.data ?? [];
  const filteredCourses = useMemo(
    () => filterAndSortCourses(allCourses, filters),
    [allCourses, filters],
  );

  const getResultsCount = useCallback(
    (f: {
      tab: CourseTabType;
      level: TrainingLevelType;
      progress: ProgressFilterType;
      rating: RatingFilterType;
    }) => {
      return filterAndSortCourses(allCourses, {
        ...filters,
        ...f,
      }).length;
    },
    [allCourses, filters],
  );

  const handleToggleFavorite = useCallback(
    async (courseId: string) => {
      const wasFavorite = isFavorite(courseId);
      if (wasFavorite) {
        removeFromFavorites(courseId);
      } else {
        addToFavorites(courseId);
      }
      setPendingIds((prev) => [...prev, courseId]);
      try {
        const res = await coursesApi.toggleFavorite(
          courseId,
          wasFavorite ? "remove" : "add",
        );
        if (res.success) {
          queryClient.invalidateQueries({ queryKey: ["favorites"] });
        } else {
          throw new Error(res.error ?? "Ошибка избранного");
        }
      } catch (err) {
        if (wasFavorite) {
          addToFavorites(courseId);
        } else {
          removeFromFavorites(courseId);
        }
        setSnackbar({
          visible: true,
          message: err instanceof Error ? err.message : "Ошибка избранного",
        });
      } finally {
        setPendingIds((prev) => prev.filter((id) => id !== courseId));
      }
    },
    [
      isFavorite,
      addToFavorites,
      removeFromFavorites,
      queryClient,
    ],
  );

  const renderCourseItem = useCallback(
    ({ item }: { item: Course }) => {
      const courseIsFavorite = isFavorite(item.id) ?? item.isFavorite;
      return (
        <CourseCard
          course={item}
          isFavorite={courseIsFavorite}
          onToggleFavorite={() => handleToggleFavorite(item.id)}
          disabled={pendingIds.includes(item.id)}
        />
      );
    },
    [isFavorite, handleToggleFavorite, pendingIds],
  );

  const keyExtractor = useCallback((item: Course) => item.id, []);

  const listHeader = (
    <View style={styles.headerFilters}>
      <Text style={styles.pageTitle}>Курсы</Text>
      <CourseSearch
        value={filters.search}
        onChange={(v) => setFilter("search", v)}
      />
      <CourseFilters
        activeTab={filters.tab}
        onTabChange={(tab) => setFilter("tab", tab)}
        activeLevel={filters.level}
        onLevelChange={(level) => setFilter("level", level)}
        activeProgress={filters.progress}
        onProgressChange={(progress) => setFilter("progress", progress)}
        activeRating={filters.rating}
        onRatingChange={(rating) => setFilter("rating", rating)}
        activeSorting={filters.sorting}
        onSortingChange={(sorting) => setFilter("sorting", sorting)}
        onResetFilters={() => setFilter("search", "")}
        getResultsCount={getResultsCount}
      />
    </View>
  );

  if (isOffline) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <OfflineDownloadedScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isLoading ? (
        <Loading fullScreen message="Загрузка курсов..." />
      ) : error ? (
        <View style={styles.errorContainer}>
          {listHeader}
          <Text style={styles.errorText}>Ошибка загрузки курсов</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={filteredCourses}
          renderItem={renderCourseItem}
          keyExtractor={keyExtractor}
          overrideProps={{ estimatedItemSize: 380 }}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {filters.search
                  ? `По запросу "${filters.search}" ничего не найдено`
                  : "В этой категории пока нет курсов"}
              </Text>
            </View>
          }
        >
        </FlashList>
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
  headerFilters: {
    paddingBottom: SPACING.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
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
    marginBottom: SPACING.md,
    textAlign: "center",
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

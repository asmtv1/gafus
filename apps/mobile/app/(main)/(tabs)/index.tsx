import { useTabContentBottomPadding } from "@/shared/lib/useTabContentBottomPadding";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  InteractionManager,
  Platform,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text, Snackbar } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";

import { Loading } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore, useCourseStore } from "@/shared/stores";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { getMobileMoscowDateKey, useTodayDailyCourse } from "@/shared/hooks/useDailyCourse";
import { usePrefetchOtherTabsAfterCourses } from "@/shared/hooks/usePrefetchOtherTabsAfterCourses";
import { coursesApi, type Course } from "@/shared/lib/api";
import type { TodayDailyCourseResponse } from "@/shared/lib/api";
import { coursesCatalogQueryOptions } from "@/shared/lib/api/coursesQuery";
import { reportClientError } from "@/shared/lib/tracer";
import { CourseCard, CourseSearch, CourseFilters } from "@/features/courses";
import { useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { OfflineDownloadedScreen } from "@/features/offline";
import { TourTarget } from "@/shared/lib/tour-targets";
import {
  filterAndSortCourses,
  type CourseTabType,
  type TrainingLevelType,
  type ProgressFilterType,
  type RatingFilterType,
} from "@/shared/utils/courseFilters";
import { getCourseLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { COLORS, FONTS, SPACING, API_BASE_URL } from "@/shared/config";
import { useMobileAppPublicConfig } from "@/shared/lib/api/public-config-query";

const LOGO_PREFETCH_LIMIT = 12;
const INITIAL_COURSE_RENDER_BATCH_SIZE = 5;
const TOUR_COURSES_SCROLL_FALLBACK_OFFSET = 680;
const SHOW_COURSES_SEARCH = false;
const DAILY_COURSE_LOGO = {
  url: "https://storage.yandexcloud.net/gafus-media/uploads/courses/course-day-logo.png?v=20260505-1620",
  alt: "Курс дня",
};
const DAILY_COURSE_DESCRIPTION =
  "Каждый день — новая короткая связка упражнений для спокойного прогресса с собакой.";

function getCourseLogoUri(
  logoImg: string | null | undefined,
  updatedAt: Date | string | null | undefined,
): string | null {
  if (!logoImg) return null;
  const baseLogoUri = logoImg.startsWith("/")
    ? `${API_BASE_URL.replace(/\/$/, "")}${logoImg}`
    : logoImg;
  const logoVersion = updatedAt != null ? new Date(updatedAt).getTime().toString() : "no-version";
  return `${baseLogoUri}${baseLogoUri.includes("?") ? "&" : "?"}v=${logoVersion}`;
}

function getCourseLogoPrefetchUri(course: Course): string | null {
  const base = getCourseLogoUri(course.logoImg, course.updatedAt);
  if (!base) return null;
  const candidates = getCourseLogoVariantCandidates(base);
  return candidates[0] ?? null;
}

function DailyCourseCard({
  data,
  onPress,
}: {
  data: TodayDailyCourseResponse | null;
  onPress: (scheduleId: string) => void;
}) {
  if (!data?.scheduleId || !data.day) {
    return (
      <View style={styles.dailyCourseCard}>
        <TourTarget id="daily-course-card" style={styles.tourTargetFill} />
        <View style={styles.dailyCourseEmptyContent}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={24} color={COLORS.primary} />
          <Text style={styles.dailyCourseTitle}>Сегодня связка не запланирована</Text>
        </View>
      </View>
    );
  }

  const progress = `${data.stepsSummary.completed}/${data.stepsSummary.total}`;
  const progressPercent =
    data.stepsSummary.total > 0
      ? Math.round((data.stepsSummary.completed / data.stepsSummary.total) * 100)
      : 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.dailyCourseCard, pressed && styles.dailyCourseCardPressed]}
      onPress={() => onPress(data.scheduleId!)}
      accessibilityRole="button"
      accessibilityLabel={`Задание дня. Обновляется ежедневно. ${data.day.stepsCount} упражнения. ${progress} выполнено.`}
      accessibilityHint="Показывает упражнения, запланированные на сегодня"
    >
      <TourTarget id="daily-course-card" style={styles.tourTargetFill} />
      <View style={styles.dailyCourseMedia}>
        <Image
          source={{ uri: DAILY_COURSE_LOGO.url }}
          style={styles.dailyCourseImage}
          contentFit="cover"
          accessibilityLabel={DAILY_COURSE_LOGO.alt}
        />
      </View>
      <View style={styles.dailyCourseContent}>
        <View style={styles.dailyCourseHeader}>
          <View style={styles.dailyCourseTitleRow}>
            <MaterialCommunityIcons name="calendar-star" size={19} color={COLORS.primary} />
            <Text style={styles.dailyCourseTitle}>Задание дня</Text>
          </View>
          <View style={styles.dailyCourseRefreshStatus}>
            <MaterialCommunityIcons name="refresh" size={14} color={COLORS.primary} />
            <Text style={styles.dailyCourseRefreshText}>Ежедневно</Text>
          </View>
        </View>
        <Text style={styles.dailyCourseDescription}>{DAILY_COURSE_DESCRIPTION}</Text>
        <View style={styles.dailyCourseProgressBlock}>
          <View style={styles.dailyCourseProgressRow}>
            <Text style={styles.dailyCourseMeta}>{data.day.stepsCount} упражнения</Text>
            <Text style={styles.dailyCourseMeta}>{progress} выполнено</Text>
          </View>
          <View style={styles.dailyCourseProgressTrack}>
            <View
              style={[
                styles.dailyCourseProgressFill,
                { width: `${Math.min(Math.max(progressPercent, 0), 100)}%` },
              ]}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Страница со всеми курсами: поиск и фильтры как в web.
 * При офлайне показывается экран «Скачанные курсы».
 */
export default function CoursesScreen() {
  const tabContentBottomPadding = useTabContentBottomPadding();
  const isOffline = useIsOffline();
  const router = useRouter();
  const queryClient = useQueryClient();
  const courseListRef = useRef<FlashListRef<Course> | null>(null);
  const tourIsActive = useMobileOnboardingTourStore((s) => s.isActive);
  const tourStepId = useMobileOnboardingTourStore((s) => s.currentStepId);
  const { filters, setFilter, addToFavorites, removeFromFavorites, isFavorite, favorites } =
    useCourseStore(
      useShallow((s) => ({
        filters: s.filters,
        setFilter: s.setFilter,
        addToFavorites: s.addToFavorites,
        removeFromFavorites: s.removeFromFavorites,
        isFavorite: s.isFavorite,
        favorites: s.favorites,
      })),
    );

  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const { data: publicConfigResponse, isFetched: publicConfigFetched } = useMobileAppPublicConfig();
  const username = useAuthStore((s) => s.user?.username ?? null);
  const isTestUser = username?.toLowerCase() === "testuser";

  const { data, isLoading, error, refetch } = useQuery(coursesCatalogQueryOptions);
  const { data: dailyCourseData, refetch: refetchDailyCourse } = useTodayDailyCourse();

  const iosRuCardPaymentHintEnabled = Boolean(
    publicConfigResponse?.data?.iosRuCardPaymentHintEnabled,
  );
  const iosConfigLoaded = Platform.OS !== "ios" || publicConfigFetched;

  const catalogReady = !isLoading && !error;
  usePrefetchOtherTabsAfterCourses({ catalogReady });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchDailyCourse()]);
    setRefreshing(false);
  }, [refetch, refetchDailyCourse]);

  const allCourses = useMemo(() => data?.data ?? [], [data?.data]);
  const filteredCourses = useMemo(
    () => filterAndSortCourses(allCourses, filters),
    [allCourses, filters],
  );
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const pendingIdsSet = useMemo(() => new Set(pendingIds), [pendingIds]);

  useEffect(() => {
    if (isLoading || filteredCourses.length === 0) return;
    const uris = filteredCourses
      .slice(0, LOGO_PREFETCH_LIMIT)
      .map((c) => getCourseLogoPrefetchUri(c))
      .filter((u): u is string => u != null && u.length > 0);
    if (uris.length === 0) return;
    void Image.prefetch(uris, { cachePolicy: "memory-disk" });
  }, [isLoading, filteredCourses]);

  useEffect(() => {
    if (!tourIsActive || isLoading || error) return;

    const timeoutHandles: ReturnType<typeof setTimeout>[] = [];
    const interaction = InteractionManager.runAfterInteractions(() => {
      const timeout = setTimeout(() => {
        if (tourStepId === "courses" && filteredCourses.length > 0) {
          try {
            courseListRef.current?.scrollToIndex({
              index: 0,
              animated: true,
              viewPosition: 0.08,
            });
          } catch (scrollError) {
            reportClientError(
              scrollError instanceof Error ? scrollError : new Error(String(scrollError)),
              {
                issueKey: "CoursesScreen",
                severity: "warning",
                keys: { operation: "tour_scroll_to_courses" },
              },
            );
            courseListRef.current?.scrollToOffset({
              offset: TOUR_COURSES_SCROLL_FALLBACK_OFFSET,
              animated: true,
            });
          }
          return;
        }

        if (tourStepId === "daily-course") {
          courseListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      }, 120);
      timeoutHandles.push(timeout);
    });

    return () => {
      interaction.cancel();
      timeoutHandles.forEach(clearTimeout);
    };
  }, [error, filteredCourses.length, isLoading, tourIsActive, tourStepId]);

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
        const res = await coursesApi.toggleFavorite(courseId, wasFavorite ? "remove" : "add");
        if (res.success) {
          queryClient.invalidateQueries({ queryKey: ["favorites"] });
        } else {
          throw new Error(res.error ?? "Ошибка избранного");
        }
      } catch (err) {
        reportClientError(err instanceof Error ? err : new Error(String(err)), {
          issueKey: "CoursesScreen",
          keys: { operation: "toggle_favorite" },
        });
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
    [isFavorite, addToFavorites, removeFromFavorites, queryClient],
  );

  const renderCourseItem = useCallback(
    ({ item, index }: { item: Course; index: number }) => {
      const courseIsFavorite = favoritesSet.has(item.id) || item.isFavorite;
      const card = (
        <CourseCard
          course={item}
          isFavorite={courseIsFavorite}
          onToggleFavorite={handleToggleFavorite}
          disabled={pendingIdsSet.has(item.id)}
          showIosRuCardPaymentHint={
            Platform.OS === "ios" && iosConfigLoaded && iosRuCardPaymentHintEnabled && !isTestUser
          }
          tourTargetId={index === 0 ? "courses-list" : undefined}
        />
      );
      return card;
    },
    [
      favoritesSet,
      handleToggleFavorite,
      isTestUser,
      iosConfigLoaded,
      iosRuCardPaymentHintEnabled,
      pendingIdsSet,
    ],
  );

  const keyExtractor = useCallback((item: Course) => item.id, []);
  const listExtraData = useMemo(
    () => ({
      favoritesKey: favorites.join("|"),
      pendingKey: pendingIds.join("|"),
    }),
    [favorites, pendingIds],
  );

  const listHeader = (
    <View style={styles.headerFilters}>
      <View style={styles.headerArtwork}>
        <Image
          source={require("../../../assets/images/courses-header.png")}
          style={styles.headerImage}
          contentFit="cover"
          accessible
          accessibilityLabel="Курсы. Занятия и ежедневная практика для вашего питомца"
        />
      </View>
      <DailyCourseCard
        data={dailyCourseData?.data ?? null}
        onPress={(scheduleId) => router.push(`/daily-course/${scheduleId}`)}
      />
      {SHOW_COURSES_SEARCH ? (
        <CourseSearch value={filters.search} onChange={(v) => setFilter("search", v)} />
      ) : null}
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
    const cachedDailyCourse = dailyCourseData?.data;
    const canShowCachedDailyCourse =
      cachedDailyCourse?.scheduleId != null &&
      cachedDailyCourse.mskDate === getMobileMoscowDateKey();
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        {canShowCachedDailyCourse ? (
          <DailyCourseCard
            data={cachedDailyCourse}
            onPress={(scheduleId) => router.push(`/daily-course/${scheduleId}`)}
          />
        ) : null}
        <OfflineDownloadedScreen />
      </TexturedSafeAreaView>
    );
  }

  if (isLoading) {
    return <Loading fullScreen message="Загрузка курсов..." />;
  }

  return (
    <TexturedSafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {error ? (
        <View style={styles.errorContainer}>
          {listHeader}
          <Text style={styles.errorText}>Ошибка загрузки курсов</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.listWrap}>
          <FlashList
            ref={courseListRef}
            data={filteredCourses}
            renderItem={renderCourseItem}
            keyExtractor={keyExtractor}
            extraData={listExtraData}
            overrideProps={{
              estimatedItemSize: 380,
              initialDrawBatchSize: INITIAL_COURSE_RENDER_BATCH_SIZE,
            }}
            ListHeaderComponent={listHeader}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabContentBottomPadding }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {filters.search
                    ? `По запросу "${filters.search}" ничего не найдено`
                    : "В этой категории пока нет курсов"}
                </Text>
              </View>
            }
          />
        </View>
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
  },
  listWrap: {
    flex: 1,
    position: "relative",
  },
  headerFilters: {
    paddingBottom: SPACING.sm,
  },
  headerArtwork: {
    height: 180,
    marginHorizontal: -SPACING.sm,
    marginBottom: SPACING.md,
    position: "relative",
    zIndex: 1,
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },
  dailyCourseCard: {
    position: "relative",
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    marginBottom: SPACING.lg,
    shadowColor: "#4A4917",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  dailyCourseCardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.992 }],
  },
  tourTargetFill: {
    ...StyleSheet.absoluteFillObject,
  },
  dailyCourseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  dailyCourseTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  dailyCourseMedia: {
    width: "100%",
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  dailyCourseImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: "#EFE7DF",
  },
  dailyCourseContent: {
    padding: SPACING.md,
    gap: 12,
  },
  dailyCourseEmptyContent: {
    minHeight: 112,
    padding: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  dailyCourseTitle: {
    flexShrink: 1,
    color: "#352E2E",
    fontSize: 17,
    lineHeight: 22,
    fontFamily: FONTS.montserratBold,
  },
  dailyCourseRefreshStatus: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#EEE7D2",
  },
  dailyCourseRefreshText: {
    color: "#636128",
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONTS.montserratBold,
  },
  dailyCourseDescription: {
    color: "#514B46",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.montserrat,
  },
  dailyCourseProgressBlock: {
    gap: 8,
  },
  dailyCourseProgressRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  dailyCourseMeta: {
    color: "#686540",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.montserratMedium,
  },
  dailyCourseProgressTrack: {
    width: "100%",
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(99, 97, 40, 0.18)",
  },
  dailyCourseProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#636128",
  },
  listContent: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  errorContainer: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
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

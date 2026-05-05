import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { Loading } from "@/shared/components/ui";
import { useAuthStore, useCourseStore } from "@/shared/stores";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { getMobileMoscowDateKey, useTodayDailyCourse } from "@/shared/hooks/useDailyCourse";
import { usePrefetchOtherTabsAfterCourses } from "@/shared/hooks/usePrefetchOtherTabsAfterCourses";
import { coursesApi, subscriptionsApi, type Course } from "@/shared/lib/api";
import type { TodayDailyCourseResponse } from "@/shared/lib/api";
import { coursesCatalogQueryOptions } from "@/shared/lib/api/coursesQuery";
import { reportClientError } from "@/shared/lib/tracer";
import { getCurrentDeviceTokens, setupPushNotifications } from "@/shared/lib/utils/notifications";
import { CourseCard, CourseSearch, CourseFilters } from "@/features/courses/components";
import { TourTarget, useMobileOnboardingTourStore } from "@/features/onboarding-tour";
import { OfflineDownloadedScreen } from "@/features/offline";
import {
  filterAndSortCourses,
  type CourseTabType,
  type TrainingLevelType,
  type ProgressFilterType,
  type RatingFilterType,
} from "@/shared/utils/courseFilters";
import { getCourseLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { COLORS, SPACING, FONTS, API_BASE_URL } from "@/constants";
import { fetchMobileAppPublicConfig } from "@/shared/lib/api/public-config";

const LOGO_PREFETCH_LIMIT = 12;
/** Первые карточки (карточка высокая — не завышать, иначе FlashList может не смонтировать все ячейки). */
const VIEWPORT_COURSE_LOGO_GATE_COUNT = 3;
const VIEWPORT_OVERLAY_SETTLE_MS = 96;
/** Если гейт не закрылся (сеть, баг нативного слоя) — не блокировать UI навсегда. */
const VIEWPORT_GATE_FORCE_MS = 12_000;
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

function courseHasLogo(course: Course): boolean {
  return getCourseLogoUri(course.logoImg, course.updatedAt) != null;
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
        <Text style={styles.dailyCourseEyebrow}>Курс дня</Text>
        <Text style={styles.dailyCourseTitle}>Сегодня связка не запланирована</Text>
      </View>
    );
  }

  const progress = `${data.stepsSummary.completed}/${data.stepsSummary.total}`;
  const progressPercent =
    data.stepsSummary.total > 0
      ? Math.round((data.stepsSummary.completed / data.stepsSummary.total) * 100)
      : 0;

  return (
    <Pressable style={styles.dailyCourseCard} onPress={() => onPress(data.scheduleId!)}>
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
          <View style={styles.dailyCoursePill}>
            <Text style={styles.dailyCoursePillText}>Обновляется ежедневно</Text>
          </View>
        </View>
        <View style={styles.dailyCourseText}>
          <Text style={styles.dailyCourseDescription}>{DAILY_COURSE_DESCRIPTION}</Text>
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
  const { isOffline } = useNetworkStatus();
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
  const [viewportReady, setViewportReady] = useState(false);
  const [iosRuCardPaymentHintEnabled, setIosRuCardPaymentHintEnabled] = useState(false);
  const [iosConfigLoaded, setIosConfigLoaded] = useState(Platform.OS !== "ios");
  const pushPromptAskedInSession = useRef(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const username = useAuthStore((s) => s.user?.username ?? null);
  const isTestUser = username?.toLowerCase() === "testuser";

  const { data, isLoading, error, refetch } = useQuery(coursesCatalogQueryOptions);
  const { data: dailyCourseData, refetch: refetchDailyCourse } = useTodayDailyCourse();

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMobileAppPublicConfig();
        if (!cancelled && res.success && res.data) {
          setIosRuCardPaymentHintEnabled(res.data.iosRuCardPaymentHintEnabled);
        }
      } finally {
        if (!cancelled) {
          setIosConfigLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalogReady = !isLoading && !error;
  usePrefetchOtherTabsAfterCourses({ catalogReady });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchDailyCourse()]);
    setRefreshing(false);
  }, [refetch, refetchDailyCourse]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    let cancelled = false;

    const ensurePushSubscription = async () => {
      if (pushPromptAskedInSession.current) return;

      const tokens = await getCurrentDeviceTokens();
      const endpoints = [tokens.expo, tokens.rustore].filter(
        (ep): ep is string => typeof ep === "string" && ep.length > 0,
      );
      const status = await subscriptionsApi.postPushDeviceStatus(endpoints);
      if (cancelled || !status.success) return;

      pushPromptAskedInSession.current = true;

      const hadThisDeviceSubscription = !!status.data?.hasThisDeviceSubscription;
      if (hadThisDeviceSubscription) {
        return;
      }

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
  }, [isAuthenticated, authLoading]);

  const allCourses = useMemo(() => data?.data ?? [], [data?.data]);
  const filteredCourses = useMemo(
    () => filterAndSortCourses(allCourses, filters),
    [allCourses, filters],
  );
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const pendingIdsSet = useMemo(() => new Set(pendingIds), [pendingIds]);

  const gateCourses = useMemo(
    () => filteredCourses.slice(0, VIEWPORT_COURSE_LOGO_GATE_COUNT),
    [filteredCourses],
  );

  const viewportGateSyncKey = useMemo(
    () => gateCourses.map((c) => `${c.id}:${new Date(c.updatedAt).getTime()}`).join("|"),
    [gateCourses],
  );

  const viewportGatePendingIdsRef = useRef<Set<string>>(new Set());
  const viewportGateKeyRef = useRef<string>("");

  if (viewportGateKeyRef.current !== viewportGateSyncKey) {
    viewportGateKeyRef.current = viewportGateSyncKey;
    const next = new Set<string>();
    for (const c of gateCourses) {
      if (courseHasLogo(c)) next.add(c.id);
    }
    viewportGatePendingIdsRef.current = next;
  }

  useLayoutEffect(() => {
    if (isLoading) {
      setViewportReady(false);
      return;
    }
    if (filteredCourses.length === 0) {
      setViewportReady(true);
      return;
    }
    setViewportReady(viewportGatePendingIdsRef.current.size === 0);
  }, [isLoading, filteredCourses.length, viewportGateSyncKey]);

  const handleViewportCoverReady = useCallback((courseId: string) => {
    const pending = viewportGatePendingIdsRef.current;
    if (!pending.has(courseId)) return;
    pending.delete(courseId);
    if (pending.size === 0) {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              setViewportReady(true);
            }, VIEWPORT_OVERLAY_SETTLE_MS);
          });
        });
      });
    }
  }, []);

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
    if (isLoading || error || refreshing || filteredCourses.length === 0 || viewportReady) return;
    const t = setTimeout(() => {
      setViewportReady(true);
    }, VIEWPORT_GATE_FORCE_MS);
    return () => clearTimeout(t);
  }, [isLoading, error, refreshing, filteredCourses.length, viewportReady, viewportGateSyncKey]);

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
          } catch {
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
          listIndex={index}
          viewportGateCount={VIEWPORT_COURSE_LOGO_GATE_COUNT}
          onViewportCoverReady={handleViewportCoverReady}
          tourTargetId={index === 0 ? "courses-list" : undefined}
        />
      );
      return card;
    },
    [
      favoritesSet,
      handleToggleFavorite,
      handleViewportCoverReady,
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

  const showViewportLoadingOverlay =
    !error && !refreshing && !isLoading && filteredCourses.length > 0 && !viewportReady;

  const listHeader = (
    <View style={styles.headerFilters}>
      <Text style={styles.pageTitle}>Курсы</Text>
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
      <SafeAreaView style={styles.container} edges={["top"]}>
        {canShowCachedDailyCourse ? (
          <DailyCourseCard
            data={cachedDailyCourse}
            onPress={(scheduleId) => router.push(`/daily-course/${scheduleId}`)}
          />
        ) : null}
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
        <View style={styles.listWrap}>
          <FlashList
            ref={courseListRef}
            data={filteredCourses}
            renderItem={renderCourseItem}
            keyExtractor={keyExtractor}
            extraData={listExtraData}
            overrideProps={{
              estimatedItemSize: 380,
              initialDrawBatchSize: VIEWPORT_COURSE_LOGO_GATE_COUNT + 2,
            }}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
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
          {showViewportLoadingOverlay ? (
            <View style={styles.viewportLoadingOverlay} pointerEvents="auto">
              <Loading message="Загрузка курсов..." size="large" />
            </View>
          ) : null}
        </View>
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
  listWrap: {
    flex: 1,
    position: "relative",
  },
  viewportLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
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
  dailyCourseCard: {
    position: "relative",
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFF8E5",
    borderRadius: 12,
    marginBottom: 36,
    borderWidth: 2,
    borderColor: "#636128",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tourTargetFill: {
    ...StyleSheet.absoluteFillObject,
  },
  dailyCourseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  dailyCourseMedia: {
    width: "100%",
    paddingTop: 10,
    paddingHorizontal: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  dailyCourseImage: {
    width: "100%",
    maxWidth: 350,
    aspectRatio: 245 / 140,
    borderRadius: 8,
    backgroundColor: "#EFE7DF",
  },
  dailyCourseContent: {
    paddingTop: 10,
    paddingHorizontal: 30,
    alignItems: "center",
  },
  dailyCourseText: {
    width: "100%",
    alignItems: "center",
  },
  dailyCourseEyebrow: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: SPACING.xs,
  },
  dailyCourseTitle: {
    color: "#352E2E",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: SPACING.xs,
  },
  dailyCoursePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    minHeight: 28,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.2)",
    backgroundColor: "rgba(255, 248, 229, 0.92)",
  },
  dailyCoursePillText: {
    color: "#636128",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dailyCourseDescription: {
    color: "#352E2E",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 10,
    textAlign: "center",
  },
  dailyCourseProgressRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  dailyCourseMeta: {
    color: "rgba(53, 46, 46, 0.78)",
    fontSize: 15,
    fontWeight: "600",
  },
  dailyCourseProgressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(99, 97, 40, 0.18)",
    marginTop: 12,
    marginBottom: 12,
  },
  dailyCourseProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#636128",
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

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  InteractionManager,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { Loading } from "@/shared/components/ui";
import { useAuthStore, useCourseStore } from "@/shared/stores";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { usePrefetchOtherTabsAfterCourses } from "@/shared/hooks/usePrefetchOtherTabsAfterCourses";
import { coursesApi, subscriptionsApi, type Course } from "@/shared/lib/api";
import { coursesCatalogQueryOptions } from "@/shared/lib/api/coursesQuery";
import { reportClientError } from "@/shared/lib/tracer";
import { getCurrentDeviceTokens, setupPushNotifications } from "@/shared/lib/utils/notifications";
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
import { getCourseLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { COLORS, SPACING, FONTS, API_BASE_URL } from "@/constants";

const LOGO_PREFETCH_LIMIT = 12;
/** Первые карточки (карточка высокая — не завышать, иначе FlashList может не смонтировать все ячейки). */
const VIEWPORT_COURSE_LOGO_GATE_COUNT = 3;
const VIEWPORT_OVERLAY_SETTLE_MS = 96;
/** Если гейт не закрылся (сеть, баг нативного слоя) — не блокировать UI навсегда. */
const VIEWPORT_GATE_FORCE_MS = 12_000;

function getCourseLogoUri(
  logoImg: string | null | undefined,
  updatedAt: Date | string | null | undefined,
): string | null {
  if (!logoImg) return null;
  const baseLogoUri = logoImg.startsWith("/")
    ? `${API_BASE_URL.replace(/\/$/, "")}${logoImg}`
    : logoImg;
  const logoVersion =
    updatedAt != null ? new Date(updatedAt).getTime().toString() : "no-version";
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
    favorites,
  } = useCourseStore(
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
  const pushPromptAskedInSession = useRef(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);

  const { data, isLoading, error, refetch } = useQuery(coursesCatalogQueryOptions);

  const catalogReady = !isLoading && !error;
  usePrefetchOtherTabsAfterCourses({ catalogReady });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
  }, [
    isLoading,
    error,
    refreshing,
    filteredCourses.length,
    viewportReady,
    viewportGateSyncKey,
  ]);

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
    [
      isFavorite,
      addToFavorites,
      removeFromFavorites,
      queryClient,
    ],
  );

  const renderCourseItem = useCallback(
    ({ item, index }: { item: Course; index: number }) => {
      const courseIsFavorite = favoritesSet.has(item.id) || item.isFavorite;
      return (
        <CourseCard
          course={item}
          isFavorite={courseIsFavorite}
          onToggleFavorite={handleToggleFavorite}
          disabled={pendingIdsSet.has(item.id)}
          listIndex={index}
          viewportGateCount={VIEWPORT_COURSE_LOGO_GATE_COUNT}
          onViewportCoverReady={handleViewportCoverReady}
        />
      );
    },
    [favoritesSet, handleToggleFavorite, handleViewportCoverReady, pendingIdsSet],
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
    !error &&
    !refreshing &&
    !isLoading &&
    filteredCourses.length > 0 &&
    !viewportReady;

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
        <View style={styles.listWrap}>
          <FlashList
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

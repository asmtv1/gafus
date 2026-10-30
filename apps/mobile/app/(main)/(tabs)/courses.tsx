import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { View, StyleSheet, RefreshControl, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text, Snackbar } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { Loading } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore, useCourseStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { apiClient } from "@/shared/lib/api/client";
import type { Course } from "@/shared/lib/api/courses";
import { reportClientError } from "@/shared/lib/tracer";
import { CourseCard } from "@/features/courses";
import { OfflineDownloadedScreen } from "@/features/offline";
import { COLORS, SPACING, FONTS } from "@/shared/config";

type FavoriteActor = { ownerId: string; authEpoch: string };
type FavoriteRows = { favoriteIds: string[]; data: Course[] };
const route = "/api/v1/courses/favorites";
const checkedActor = (): FavoriteActor | null => {
  const state = useAuthStore.getState();
  if (!state.isAuthenticated || state.isLoading || !state.user?.id) return null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (!binding || binding.principalId !== state.user.id || !binding.authEpoch) return null;
  return { ownerId: state.user.id, authEpoch: binding.authEpoch };
};
const sameActor = (actor: FavoriteActor) => {
  const now = checkedActor();
  return now?.ownerId === actor.ownerId && now.authEpoch === actor.authEpoch;
};
const parseFavorites = (value: unknown): FavoriteRows => {
  if (!value || typeof value !== "object") throw new Error("FAVORITES_INVALID");
  const data = value as Partial<FavoriteRows>;
  if (
    !Array.isArray(data.favoriteIds) ||
    !data.favoriteIds.every((id) => typeof id === "string") ||
    !Array.isArray(data.data) ||
    !data.data.every(
      (course) =>
        course &&
        typeof course === "object" &&
        typeof course.id === "string" &&
        typeof course.name === "string" &&
        typeof course.type === "string" &&
        typeof course.isPaid === "boolean" &&
        typeof course.isPrivate === "boolean",
    )
  )
    throw new Error("FAVORITES_INVALID");
  const favorites = new Set(data.favoriteIds);
  return {
    favoriteIds: [...favorites],
    data: data.data.filter((course) => favorites.has(course.id)),
  };
};
/** Online personal favorites userflow. Offline downloads keep their existing screen. */
// The hidden tab must never mount the favorites data loader or mutation UI.
export default function FavoritesScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
export function FavoritesScreenContent() {
  const isOffline = useIsOffline();
  const auth = useAuthStore(
    useShallow((s) => ({
      id: s.user?.id ?? null,
      authed: s.isAuthenticated,
      loading: s.isLoading,
    })),
  );
  const live = checkedActor();
  if (isOffline)
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <OfflineDownloadedScreen />
      </TexturedSafeAreaView>
    );
  if (auth.loading || (auth.authed && !live))
    return <Loading fullScreen message="Загрузка избранных курсов..." />;
  if (!auth.authed || !live)
    return (
      <TexturedSafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.emptyText}>Для просмотра избранных курсов войдите в аккаунт.</Text>
      </TexturedSafeAreaView>
    );
  return (
    <OwnerFavorites
      key={`${live.ownerId}:${live.authEpoch}`}
      ownerId={live.ownerId}
      authEpoch={live.authEpoch}
    />
  );
}
function OwnerFavorites({ ownerId, authEpoch }: FavoriteActor) {
  const actor = useMemo(() => ({ ownerId, authEpoch }), [ownerId, authEpoch]);
  const client = useQueryClient();
  const mounted = useRef(true);
  const refreshingRef = useRef(false);
  const removingRef = useRef(new Set<string>());
  const unknownRef = useRef(new Set<string>());
  const { removeFromFavorites } = useCourseStore(
    useShallow((s) => ({ removeFromFavorites: s.removeFromFavorites })),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [unknownIds, setUnknownIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const current = useCallback(() => mounted.current && sameActor(actor), [actor]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const queryKey = useMemo(
    () => ["favorites", "screen", ownerId, authEpoch] as const,
    [ownerId, authEpoch],
  );
  const { data, isPending, isError, refetch } = useQuery({
    queryKey,
    enabled: true,
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<FavoriteRows> => {
      if (!current()) throw new Error("FAVORITES_SESSION_CHANGED");
      const res = await apiClient<FavoriteRows>(route, { requestGuard: current });
      if (!current()) throw new Error("FAVORITES_SESSION_CHANGED");
      if (!res.success) throw new Error("FAVORITES_READ_UNAVAILABLE");
      return parseFavorites(res.data);
    },
  });
  useEffect(() => {
    if (!data || !current()) return;
    // Existing global store is only synchronized from a verified server-owned GET.
    useCourseStore.setState({ favorites: data.favoriteIds });
  }, [data, current]);
  const displayedCourses = useMemo(
    () => [...(data?.data ?? [])].sort((a, b) => Number(a.isPaid) - Number(b.isPaid)),
    [data],
  );
  const onRefresh = useCallback(async () => {
    if (!current() || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const result = await refetch();
      if (current() && !result.isError) {
        unknownRef.current.clear();
        setUnknownIds([]);
        setSnackbar({ visible: false, message: "" });
      }
    } catch {
      if (current())
        reportClientError(new Error("FAVORITES_REFRESH_UNKNOWN"), {
          issueKey: "FavoritesScreen",
          keys: { operation: "refresh" },
        });
    } finally {
      refreshingRef.current = false;
      if (current()) setRefreshing(false);
    }
  }, [current, refetch]);
  const handleUnfavorite = useCallback(
    async (courseId: string) => {
      if (
        !current() ||
        removingRef.current.has(courseId) ||
        unknownRef.current.has(courseId) ||
        !data?.favoriteIds.includes(courseId)
      )
        return;
      removingRef.current.add(courseId);
      setPendingIds((previous) => [...previous, courseId]);
      try {
        // Existing POST action=remove stays idempotent. No refresh/replay on 401 writes.
        const response = await apiClient<{ isFavorite: boolean }>(route, {
          method: "POST",
          body: { courseId, action: "remove" },
          requestGuard: current,
          skipAuthRefreshReplay: true,
        });
        if (!current()) return;
        if (!response.success || response.data?.isFavorite !== false)
          throw new Error("FAVORITES_REMOVE_UNCONFIRMED");
        client.setQueryData<FavoriteRows>(queryKey, (old) =>
          old
            ? {
                favoriteIds: old.favoriteIds.filter((id) => id !== courseId),
                data: old.data.filter((course) => course.id !== courseId),
              }
            : old,
        );
        removeFromFavorites(courseId);
        try {
          await client.invalidateQueries({ queryKey: ["favorites"], exact: false });
        } catch {
          if (current())
            reportClientError(new Error("FAVORITES_POST_ACK_REFRESH_FAILED"), {
              issueKey: "FavoritesScreen",
              keys: { operation: "post_ack_refresh" },
            });
        }
      } catch {
        if (current()) {
          unknownRef.current.add(courseId);
          setUnknownIds((previous) => [...new Set([...previous, courseId])]);
          reportClientError(new Error("FAVORITES_REMOVE_UNKNOWN"), {
            issueKey: "FavoritesScreen",
            keys: { operation: "remove" },
          });
          setSnackbar({
            visible: true,
            message: "Не удалось подтвердить удаление из избранного. Обновите список.",
          });
        }
      } finally {
        removingRef.current.delete(courseId);
        if (current()) setPendingIds((previous) => previous.filter((id) => id !== courseId));
      }
    },
    [client, current, data, queryKey, removeFromFavorites],
  );
  const blockedIdsSet = useMemo(
    () => new Set([...pendingIds, ...unknownIds]),
    [pendingIds, unknownIds],
  );
  const renderCourseItem = useCallback(
    ({ item }: { item: Course }) => (
      <View>
        <CourseCard
          course={item}
          isFavorite
          onToggleFavorite={handleUnfavorite}
          disabled={blockedIdsSet.has(item.id)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Убрать из избранного: ${item.name}`}
          disabled={blockedIdsSet.has(item.id)}
          onPress={() => void handleUnfavorite(item.id)}
          style={styles.favoriteRemoveButton}
        >
          <Text style={styles.favoriteRemoveText}>
            {pendingIds.includes(item.id)
              ? "Убираем…"
              : unknownIds.includes(item.id)
                ? "Обновите список для повтора"
                : "Убрать из избранного"}
          </Text>
        </Pressable>
      </View>
    ),
    [handleUnfavorite, blockedIdsSet, pendingIds, unknownIds],
  );
  const renderHeader = useCallback(
    () => (
      <View style={styles.headerFilters}>
        <Text style={styles.pageTitle}>Избранные курсы</Text>
      </View>
    ),
    [],
  );
  if (isPending) return <Loading fullScreen message="Загрузка избранных курсов..." />;
  return (
    <TexturedSafeAreaView style={styles.container} edges={["top"]}>
      {isError || !data ? (
        <View style={styles.errorContainer}>
          {renderHeader()}
          <Text style={styles.errorText}>Не удалось загрузить избранные курсы.</Text>
          <Pressable accessibilityRole="button" onPress={() => void onRefresh()}>
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
          extraData={blockedIdsSet}
          renderItem={renderCourseItem}
          keyExtractor={(item) => item.id}
          overrideProps={{ estimatedItemSize: 380 }}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
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
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  favoriteRemoveButton: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    alignSelf: "flex-start",
  },
  favoriteRemoveText: { fontWeight: "600", color: COLORS.secondary },
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

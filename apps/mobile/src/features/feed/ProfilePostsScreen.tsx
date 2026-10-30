import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedPostCard } from "./screens";

export function FeedProfilePostsScreen({ username }: { username: string }) {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const verified = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && verified?.principalId === owner ? verified.authEpoch : null;
  if (!owner || !epoch)
    return (
      <TexturedSafeAreaView style={styles.screen}>
        <Text style={styles.body}>Для просмотра публикаций войдите в аккаунт.</Text>
      </TexturedSafeAreaView>
    );
  if (!username.trim())
    return (
      <TexturedSafeAreaView style={styles.screen}>
        <Text style={styles.body}>Профиль не найден.</Text>
      </TexturedSafeAreaView>
    );
  return (
    <ActorProfilePosts
      key={`${owner}:${epoch}:${username}`}
      owner={owner}
      epoch={epoch}
      username={username}
    />
  );
}
function ActorProfilePosts({
  owner,
  epoch,
  username,
}: {
  owner: string;
  epoch: string;
  username: string;
}) {
  const router = useRouter();
  const mounted = useRef(true);
  const paging = useRef(false),
    refreshing = useRef(false),
    availabilityRetry = useRef(false);
  const [notice, setNotice] = useState("");
  const current = () => {
    const auth = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      auth.isAuthenticated &&
      !auth.isLoading &&
      auth.user?.id === owner &&
      verified?.principalId === owner &&
      verified.authEpoch === epoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const status = useQuery({
    queryKey: ["feed", "profile-availability", owner, epoch],
    queryFn: () => feedApi.status(),
    staleTime: 30_000,
  });
  const query = useInfiniteQuery({
    queryKey: ["feed", "profile", owner, epoch, username],
    queryFn: ({ pageParam }) => feedApi.listProfilePosts(username, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: !status.isPending && !status.isError && status.data?.enabled === true,
  });
  const retryAvailability = async () => {
    if (availabilityRetry.current || !current()) return;
    availabilityRetry.current = true;
    try {
      await status.refetch();
    } catch {
      if (current())
        reportClientError(new Error("FEED_PROFILE_STATUS_FAILED"), {
          issueKey: "FeedProfile",
          keys: { operation: "status" },
        });
    } finally {
      availabilityRetry.current = false;
    }
  };
  const retryPosts = async () => {
    if (refreshing.current || !current()) return;
    refreshing.current = true;
    try {
      await query.refetch();
    } catch {
      if (current()) {
        reportClientError(new Error("FEED_PROFILE_REFRESH_FAILED"), {
          issueKey: "FeedProfile",
          keys: { operation: "refresh" },
        });
        setNotice("Не удалось обновить публикации. Попробуйте ещё раз.");
      }
    } finally {
      refreshing.current = false;
    }
  };
  const nextPage = async () => {
    if (
      paging.current ||
      query.isFetchingNextPage ||
      (query.isError && !query.isFetchNextPageError) ||
      !query.hasNextPage ||
      !current()
    )
      return;
    paging.current = true;
    setNotice("");
    try {
      await query.fetchNextPage();
    } catch {
      if (current()) {
        reportClientError(new Error("FEED_PROFILE_PAGE_FAILED"), {
          issueKey: "FeedProfile",
          keys: { operation: "next_page" },
        });
        setNotice("Не удалось загрузить следующую страницу. Попробуйте ещё раз.");
      }
    } finally {
      paging.current = false;
    }
  };
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <TexturedSafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.header}>
        <AppBackButton
          onPress={() => {
            if (current()) router.back();
          }}
        />
        <Text style={styles.title}>Публикации</Text>
      </View>
      {!!notice && (
        <Text accessibilityRole="alert" style={styles.body}>
          {notice}
        </Text>
      )}
      {status.isPending ? (
        <Loading fullScreen embedded message="Загрузка публикаций…" />
      ) : status.isError ? (
        <View style={styles.card}>
          <Text style={styles.body}>Не удалось проверить доступность «Моментов».</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить проверку доступа"
            onPress={() => void retryAvailability()}
          >
            <Text style={styles.link}>Повторить</Text>
          </Pressable>
        </View>
      ) : status.data?.enabled !== true ? (
        <View style={styles.card}>
          <Text style={styles.body}>Раздел «Моменты» пока недоступен.</Text>
        </View>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <FeedPostCard post={item} />
            </View>
          )}
          contentContainerStyle={styles.content}
          onEndReached={() => {
            if (!query.isFetchNextPageError) void nextPage();
          }}
          onEndReachedThreshold={0.4}
          onRefresh={() => void retryPosts()}
          refreshing={query.isRefetching}
          ListEmptyComponent={
            query.isPending ? (
              <Loading variant="inline" message="Загрузка публикаций…" />
            ) : (
              <View style={styles.card}>
                <Text style={styles.body}>
                  {query.isError ? "Не удалось загрузить публикации." : "Публикаций пока нет."}
                </Text>
                {query.isError && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Повторить загрузку публикаций"
                    onPress={() => void retryPosts()}
                  >
                    <Text style={styles.link}>Повторить</Text>
                  </Pressable>
                )}
              </View>
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <MascotSpinner />
            ) : query.isFetchNextPageError ? (
              <View style={styles.card}>
                <Text accessibilityRole="alert" style={styles.body}>
                  Не удалось загрузить следующую страницу. Уже загруженные публикации доступны.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Повторить следующую страницу"
                  onPress={() => void nextPage()}
                >
                  <Text style={styles.link}>Повторить страницу</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 20, color: COLORS.text },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 15 },
  content: { padding: SPACING.md },
  item: { marginBottom: SPACING.md },
  card: {
    padding: SPACING.md,
    margin: SPACING.md,
    borderRadius: 18,
    backgroundColor: COLORS.cardBackground,
  },
  body: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 14 },
});

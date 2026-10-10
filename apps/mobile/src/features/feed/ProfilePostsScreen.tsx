import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedPostCard } from "./screens";

export function FeedProfilePostsScreen({ username }: { username: string }) {
  const router = useRouter();
  const userId = useAuthStore(state => state.user?.id);
  const status = useQuery({
    queryKey: ["feed", "profile-availability", userId],
    queryFn: () => feedApi.status(),
    enabled: !!userId,
    staleTime: 30_000,
  });
  const query = useInfiniteQuery({
    queryKey: ["feed", "profile", userId, username],
    queryFn: ({ pageParam }) => feedApi.listProfilePosts(username, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: !!userId && status.data?.enabled === true && !!username,
  });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <TexturedSafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>← Назад</Text></Pressable>
      <Text style={styles.title}>Публикации</Text>
    </View>
    {status.isPending ? <Loading fullScreen embedded message="Загрузка публикаций…" /> :
      status.data?.enabled !== true ? <View style={styles.card}><Text style={styles.body}>Лента пока недоступна.</Text></View> :
      <FlashList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <View style={styles.item}><FeedPostCard post={item} /></View>}
        contentContainerStyle={styles.content}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        ListEmptyComponent={query.isPending ? <Loading variant="inline" size="large" message="Загрузка публикаций…" /> :
          <View style={styles.card}><Text style={styles.body}>{query.isError ? "Не удалось загрузить публикации." : "Публикаций пока нет."}</Text></View>}
        ListFooterComponent={query.isFetchingNextPage ? <MascotSpinner size="small" /> : null}
      />}
  </TexturedSafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 20, color: COLORS.text },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 15 },
  content: { padding: SPACING.md },
  item: { marginBottom: SPACING.md },
  card: { padding: SPACING.md, margin: SPACING.md, borderRadius: 18, backgroundColor: COLORS.cardBackground },
  body: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 14 },
});

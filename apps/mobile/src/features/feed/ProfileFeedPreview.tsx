import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuthStore } from "@/shared/stores";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";

/** Compact shared published-post preview for own and other people's profiles. */
export function ProfileFeedPreview({ username }: { username: string }) {
  const router = useRouter();
  const viewerId = useAuthStore(state => state.user?.id);
  const status = useQuery({
    queryKey: ["feed", "profile-preview-availability", viewerId],
    queryFn: () => feedApi.status(),
    enabled: !!viewerId,
    staleTime: 30_000,
  });
  const posts = useQuery({
    queryKey: ["feed", "profile-preview", viewerId, username],
    queryFn: () => feedApi.listProfilePosts(username, { pageSize: 3 }),
    enabled: !!viewerId && !!username && status.data?.enabled === true,
    staleTime: 30_000,
  });
  if (status.data?.enabled !== true) return null;
  return <View style={styles.card} accessibilityLabel="Публикации пользователя">
    <Text style={styles.title}>Публикации</Text>
    {posts.isPending && <Text style={styles.muted}>Загрузка публикаций…</Text>}
    {posts.isError && <Pressable accessibilityRole="button" onPress={() => void posts.refetch()}>
      <Text style={styles.link}>Не удалось загрузить. Повторить</Text>
    </Pressable>}
    {posts.isSuccess && posts.data.items.length === 0 &&
      <Text style={styles.muted}>Публикаций пока нет.</Text>}
    {posts.data?.items.map(post => <Pressable
      key={post.id}
      accessibilityRole="button"
      accessibilityLabel={`Открыть публикацию ${post.author.name}`}
      onPress={() => router.push({ pathname: "/(main)/feed/[postId]", params: { postId: post.id } } as Href)}
      style={styles.row}
    >
      <Text style={styles.body} numberOfLines={2}>{post.text || `Публикация с ${post.attachments.length} вложениями`}</Text>
      <Text style={styles.muted}>{post.commentCount} комментариев</Text>
    </Pressable>)}
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/(main)/feed/profile/[username]", params: { username } } as Href)}
    ><Text style={styles.link}>Все публикации →</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.cardBackground, padding: SPACING.md, borderRadius: 18, gap: SPACING.sm, marginVertical: SPACING.sm },
  row: { paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 18, color: COLORS.text },
  body: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.text, lineHeight: 22 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  link: { fontFamily: FONTS.montserratMedium, fontSize: 15, color: COLORS.primary, paddingVertical: SPACING.sm },
});

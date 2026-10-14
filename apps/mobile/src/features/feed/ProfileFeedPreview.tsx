import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuthStore } from "@/shared/stores";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";
import { Loading } from "@/shared/components";
import { PUBLICATION_ARTWORK_URI } from "./publicationArtwork";

/** Compact shared published-post preview for own and other people's profiles. */
function commentCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const word = lastTwo >= 11 && lastTwo <= 14
    ? "комментариев"
    : last === 1
      ? "комментарий"
      : last >= 2 && last <= 4
        ? "комментария"
        : "комментариев";
  return `${count} ${word}`;
}

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
  if (!viewerId) return null;
  // Render the section's header and stable container even before the status query resolves.
  if (!status.isPending && status.data?.enabled !== true) return null;
  return <View style={styles.card} accessibilityLabel="Публикации пользователя">
    <View style={styles.header}>
      <Image
        source={{ uri: PUBLICATION_ARTWORK_URI }}
        style={styles.headerIcon}
        contentFit="contain"
        accessible={false}
      />
      <Text style={styles.title}>Публикации</Text>
    </View>
    {(status.isPending || posts.isPending) && (
      <Loading variant="embedded" message="Загрузка публикаций…" />
    )}
    {posts.isError && <Pressable
      accessibilityRole="button"
      style={styles.stateAction}
      onPress={() => void posts.refetch()}
    >
      <Text style={styles.stateLink}>Не удалось загрузить. Повторить</Text>
    </Pressable>}
    {posts.isSuccess && posts.data.items.length === 0 &&
      <Text style={styles.stateText}>Публикаций пока нет.</Text>}
    {posts.data?.items.map((post, index) => <Pressable
      key={post.id}
      accessibilityRole="button"
      accessibilityLabel={`Открыть публикацию: ${post.text || "с фотографиями"}`}
      onPress={() => router.push({ pathname: "/(main)/feed/[postId]", params: { postId: post.id } } as Href)}
      style={({ pressed }) => [
        styles.row,
        index > 0 && styles.separator,
        pressed && styles.rowPressed,
      ]}
    >
      <Image
        source={{ uri: PUBLICATION_ARTWORK_URI }}
        style={styles.postIcon}
        contentFit="contain"
        accessible={false}
      />
      <View style={styles.rowContent}>
        <Text style={styles.body} numberOfLines={2}>
          {post.text || `Публикация с ${post.attachments.length} вложениями`}
        </Text>
        {post.moderationState && post.moderationState !== "visible" && <Text style={styles.body}>{post.moderationState === "removed" ? "Публикация удалена" : "Публикация скрыта"} из-за жалобы. {post.moderationReason}</Text>}
        <View style={styles.comments}>
          <MaterialCommunityIcons name="comment-outline" size={13} color={COLORS.textSecondary} />
          <Text style={styles.muted}>{commentCountLabel(post.commentCount)}</Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={21} color={COLORS.primary} />
    </Pressable>)}
    {!status.isPending && !posts.isPending && <Pressable
      accessibilityRole="button"
      accessibilityLabel="Все публикации пользователя"
      onPress={() => router.push({ pathname: "/(main)/feed/profile/[username]", params: { username } } as Href)}
      style={({ pressed }) => [styles.footer, pressed && styles.footerPressed]}
    >
      <Text style={styles.footerText}>Все публикации</Text>
      <View style={styles.footerIcon}>
        <MaterialCommunityIcons name="arrow-right" size={19} color={COLORS.primary} />
      </View>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFAF0",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(77, 92, 45, 0.22)",
    paddingTop: 14,
    paddingHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    shadowColor: "#352E2E",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  headerIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  title: { fontFamily: FONTS.montserratBold, fontSize: 17, color: COLORS.text },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 65, paddingVertical: 10, borderRadius: 8 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight },
  rowPressed: { backgroundColor: "#F0F0E4" },
  postIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  rowContent: { flex: 1, minWidth: 0, gap: 4 },
  body: { fontFamily: FONTS.montserratMedium, fontSize: 14, lineHeight: 20, color: COLORS.text },
  comments: { flexDirection: "row", alignItems: "center", gap: 5 },
  muted: { fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 17, color: COLORS.textSecondary },
  stateText: { fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 20, color: COLORS.textSecondary, paddingVertical: 14 },
  stateAction: { minHeight: 44, justifyContent: "center" },
  stateLink: { fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.primary },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 54,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: 4,
  },
  footerPressed: { opacity: 0.7 },
  footerText: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.primary },
  footerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E7ECD9",
    alignItems: "center",
    justifyContent: "center",
  },
});

import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedPostCard } from "./screens";
export function FeedPersonalScreen({ hidden = false }: { hidden?: boolean }) {
  const router = useRouter(), cache = useQueryClient();
  const userId = useAuthStore(state => state.user?.id);
  const [busy, setBusy] = useState(false);
  const saved = useInfiniteQuery({ queryKey: ["feed", "saved", userId], queryFn: ({ pageParam }) => feedApi.listBookmarks({ cursor: pageParam }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, enabled: !!userId && !hidden });
  const authors = useInfiniteQuery({ queryKey: ["feed", "hidden-authors", userId], queryFn: ({ pageParam }) => feedApi.listHiddenAuthors({ cursor: pageParam }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, enabled: !!userId && hidden });
  const active = hidden ? authors : saved;
  return <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.back()}><Text style={styles.link}>Назад</Text></Pressable>
    <Text accessibilityRole="header" style={styles.heading}>{hidden ? "Скрытые авторы" : "Закладки"}</Text>
    {hidden && <Text style={styles.text}>Эти авторы скрыты только из вашей ленты. Их профили и сохранённые публикации доступны.</Text>}
    {active.isPending ? <Loading variant="inline" size="large" message="Загрузка…" /> : active.isError ? <Pressable onPress={() => void active.refetch()}><Text style={styles.link}>Не удалось загрузить. Повторить</Text></Pressable> : !active.data?.pages.some(page => page.items.length) ? <Text style={styles.text}>{hidden ? "Скрытых авторов пока нет." : "Сохранённых публикаций пока нет."}</Text> : null}
    {hidden ? authors.data?.pages.flatMap(page => page.items).map(author => <View key={author.id} style={styles.author}>
      <Pressable onPress={() => router.push({ pathname: "/profile/[username]", params: { username: author.username } } as Href)}><Text style={styles.text}>{author.name}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={async () => {
        setBusy(true);
        try { await feedApi.setAuthorPreference(author.id, { hidden: false }); await cache.invalidateQueries({ queryKey: ["feed"] }); }
        catch (error) { Alert.alert("Лента", error instanceof Error ? error.message : "Не удалось вернуть автора."); }
        finally { setBusy(false); }
      }}><Text style={styles.link}>Вернуть в ленту</Text></Pressable>
    </View>) : saved.data?.pages.flatMap(page => page.items).map(post => <View key={post.id} style={{ marginBottom: 20 }}><FeedPostCard post={post} /></View>)}
    {active.hasNextPage && <Pressable style={styles.button} disabled={active.isFetchingNextPage} onPress={() => void active.fetchNextPage()}><Text style={styles.link}>Показать ещё</Text></Pressable>}
    {active.isFetchingNextPage && <MascotSpinner size="small" />}
  </ScrollView></TexturedSafeAreaView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  heading: { fontFamily: FONTS.montserratMedium, color: COLORS.text, fontSize: 22 },
  text: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 15, lineHeight: 22 },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 15 },
  button: { minHeight: 44, justifyContent: "center" },
  author: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.primary },
});

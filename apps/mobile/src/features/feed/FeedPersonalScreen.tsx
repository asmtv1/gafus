import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedPostCard } from "./screens";
import { FeedSectionShortcuts } from "./FeedSectionShortcuts";
export function FeedPersonalScreen({ hidden = false }: { hidden?: boolean }) {
  const router = useRouter(), cache = useQueryClient();
  const userId = useAuthStore(state => state.user?.id);
  const [busy, setBusy] = useState(false);
  const saved = useInfiniteQuery({ queryKey: ["feed", "saved", userId], queryFn: ({ pageParam }) => feedApi.listBookmarks({ cursor: pageParam }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, enabled: !!userId && !hidden });
  const authors = useInfiniteQuery({ queryKey: ["feed", "hidden-authors", userId], queryFn: ({ pageParam }) => feedApi.listHiddenAuthors({ cursor: pageParam }), initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor, enabled: !!userId && hidden });
  const active = hidden ? authors : saved;
  return <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content}>
    <AppBackButton onPress={() => router.back()} />
    <Text accessibilityRole="header" style={styles.heading}>{hidden ? "Скрытые авторы" : "Закладки"}</Text>
    <View style={styles.shortcuts}><FeedSectionShortcuts active={hidden ? "hidden" : "saved"} /></View>
    {hidden && <Text style={styles.text}>Публикации этих авторов скрыты в разделе «Моменты». Их профили и сохранённые публикации доступны.</Text>}
    {active.isPending ? <Loading message="Загрузка…" /> : active.isError ? <Pressable onPress={() => void active.refetch()}><Text style={styles.link}>Не удалось загрузить. Повторить</Text></Pressable> : !active.data?.pages.some(page => page.items.length) ? <Text style={styles.text}>{hidden ? "Скрытых авторов пока нет." : "Сохранённых публикаций пока нет."}</Text> : null}
    {hidden ? authors.data?.pages.flatMap(page => page.items).map(author => <View key={author.id} style={styles.author}>
      <Pressable onPress={() => router.push({ pathname: "/profile/[username]", params: { username: author.username } } as Href)}><Text style={styles.text}>{author.name}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={async () => {
        setBusy(true);
        try { await feedApi.setAuthorPreference(author.id, { hidden: false }); await cache.invalidateQueries({ queryKey: ["feed"] }); }
        catch (error) { Alert.alert("Моменты", error instanceof Error ? error.message : "Не удалось вернуть автора."); }
        finally { setBusy(false); }
      }}><Text style={styles.link}>Показывать в «Моментах»</Text></Pressable>
    </View>) : saved.data?.pages.flatMap(page => page.items).map(post => <View key={post.id} style={{ marginBottom: 20 }}><FeedPostCard post={post} /></View>)}
    {active.hasNextPage && <Pressable style={styles.button} disabled={active.isFetchingNextPage} onPress={() => void active.fetchNextPage()}><Text style={styles.link}>Показать ещё</Text></Pressable>}
    {active.isFetchingNextPage && <MascotSpinner />}
  </ScrollView></TexturedSafeAreaView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  heading: { fontFamily: FONTS.montserratMedium, color: COLORS.text, fontSize: 22 },
  text: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 15, lineHeight: 22 },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 15 },
  button: { minHeight: 44, justifyContent: "center" },
  author: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.primary },
  shortcuts: { marginHorizontal: -20 },
});

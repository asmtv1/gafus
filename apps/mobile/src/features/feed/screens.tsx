import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import * as Crypto from "expo-crypto";
import { useRouter, useFocusEffect, type Href } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEED_REACTIONS, FEED_LIMITS, countFeedCharacters, formatFeedTime,
  type FeedPostDto, type FeedCommentDto, type FeedReaction,
} from "@gafus/types";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { Button } from "@/shared/components";
import { feedApi } from "@/shared/lib/api/feed";
import { pickFeedMedia, uploadPickedFeedMedia, checkFeedPickedMedia, type FeedPickedMedia } from "./uploads";
import { FeedVideo, stopFeedVideoOutsidePosts } from "./FeedVideo";
import { FeedAlbumPicker } from "./FeedAlbumPicker";

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Не удалось загрузить ленту."; }
export function useFeedStatus() {
  const id = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["feed-status", id],
    queryFn: () => feedApi.status(),
    enabled: !!id,
    retry: 1,
    staleTime: 30_000,
  });
}
function Muted({ children }: { children: React.ReactNode }) { return <Text style={s.muted}>{children}</Text>; }
function Status({ status, retry }: { status: ReturnType<typeof useFeedStatus>; retry?: () => void }) {
  if (status.isPending) return <Muted>Проверяем доступность ленты…</Muted>;
  if (status.isError) return <View style={s.card}><Text style={s.error}>{errorMessage(status.error)}</Text><Button label="Повторить" onPress={() => void (retry?.() ?? status.refetch())} /></View>;
  return <View style={s.card}><Muted>Лента пока недоступна.</Muted></View>;
}
export function FeedPostCard({ post, detailed = false }: { post: FeedPostDto; detailed?: boolean }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [mediaPosition, setMediaPosition] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(260);
  const [busy, setBusy] = useState(false);
  const go = () => router.push({ pathname: "/(main)/feed/[postId]", params: { postId: post.id } } as Href);
  const react = async (reaction: FeedReaction) => {
    setBusy(true);
    try {
      if (post.myReaction === reaction) await feedApi.removePostReaction(post.id);
      else await feedApi.setPostReaction(post.id, reaction);
      await cache.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) { Alert.alert("Лента", errorMessage(error)); }
    finally { setBusy(false); }
  };
  const media = post.attachments.filter(asset => asset.status === "ready");
  return <View style={s.card} onLayout={event => setMediaWidth(Math.max(1, event.nativeEvent.layout.width - 32))}>
    <Pressable style={s.authorRow} accessibilityRole="button" accessibilityLabel={`Профиль ${post.author.name}`} onPress={() => router.push({ pathname: "/profile/[username]", params: { username: post.author.username } } as Href)}>
      {post.author.avatarUrl ? <Image source={{ uri: post.author.avatarUrl }} style={s.avatar} cachePolicy="memory" /> :
        <View style={[s.avatar, s.avatarFallback]}><Text style={s.text}>🐾</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={s.authorName} numberOfLines={2}>{post.author.name}</Text>
        <Muted>{formatFeedTime(post.publishedAt ?? post.createdAt)}{post.editedAt ? " · Изменён" : ""}</Muted>
      </View>
    </Pressable>
    {!!media.length && <ScrollView horizontal snapToInterval={mediaWidth + 10} decelerationRate="fast" showsHorizontalScrollIndicator
      contentContainerStyle={s.carousel} onScrollBeginDrag={() => stopFeedVideoOutsidePosts(new Set())}
      onMomentumScrollEnd={event => setMediaPosition(Math.round(event.nativeEvent.contentOffset.x / (mediaWidth + 10)))}>
      {media.map((asset, index) => <View style={[s.media, { width: mediaWidth }]} key={asset.id}>
        {asset.kind === "photo" && (asset.fullUrl || asset.thumbUrl) ?
          <Pressable style={s.image} onPress={go} accessibilityRole="button" accessibilityLabel={`Открыть фото ${index + 1}`}>
            <Image source={{ uri: asset.fullUrl ?? asset.thumbUrl ?? "" }} cachePolicy="memory" contentFit="contain" style={s.image} />
          </Pressable> :
          <FeedVideo postId={post.id} mediaId={asset.id} poster={asset.posterUrl} visible={index === mediaPosition} />}
      </View>)}
    </ScrollView>}
    {post.text ? <Pressable onPress={() => detailed ? undefined : setExpanded(value => !value)} accessibilityRole={detailed ? "text" : "button"} accessibilityLabel={detailed ? "Текст" : "Показать текст полностью"}>
      <Text style={s.body} numberOfLines={detailed || expanded ? undefined : 6}>{post.text}</Text>
      {!detailed && post.text.length > 250 && <Text style={s.more}>{expanded ? "Свернуть" : "Ещё"}</Text>}
    </Pressable> : null}
    <View style={s.reactions}>
      {FEED_REACTIONS.map(emoji => <Pressable key={emoji} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: post.myReaction === emoji }} onPress={() => void react(emoji)} style={[s.reaction, post.myReaction === emoji && s.reactionSelected]}>
        <Text style={s.reactionText}>{emoji} {post.reactions.find(r => r.emoji === emoji)?.count ?? ""}</Text>
      </Pressable>)}
    </View>
    <View style={s.row}>
      <Muted>{post.viewCount} просмотров</Muted>
      <Pressable accessibilityRole="button" onPress={go}><Text style={s.more}>{post.commentCount} комментариев</Text></Pressable>
    </View>
  </View>;
}
export function FeedScreen() {
  const router = useRouter();
  const userId = useAuthStore(state => state.user?.id);
  const status = useFeedStatus();
  const appActive = useRef(AppState.currentState === "active");
  const screenFocused = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener("change", value => { appActive.current = value === "active"; });
    return () => sub.remove();
  }, []);
  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    return () => { screenFocused.current = false; };
  }, []));
  const pages = useInfiniteQuery({
    queryKey: ["feed", "posts", userId],
    queryFn: ({ pageParam }) => feedApi.listPosts({ cursor: pageParam }),
    refetchInterval: 90_000,
    initialPageParam: null as string | null,
    getNextPageParam: value => value.nextCursor,
    enabled: !!userId && status.data?.enabled === true,
  });
  const posts = pages.data?.pages.flatMap(page => page.items) ?? [];
  const visibility = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: FEED_LIMITS.viewVisibleMilliseconds }).current;
  const seen = useRef(new Set<string>());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: FeedPostDto | null; isViewable: boolean }[] }) => {
    stopFeedVideoOutsidePosts(new Set(viewableItems.filter(entry => entry.isViewable && entry.item).map(entry => entry.item!.id)));
    if (!screenFocused.current || !appActive.current) return;
    for (const { item, isViewable } of viewableItems) {
      if (!item || !isViewable || item.author.id === userId || seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      void feedApi.recordView(item.id).catch(() => seen.current.delete(item.id));
    }
  }, [userId]);
  return <TexturedSafeAreaView style={s.screen} edges={["top", "left", "right"]}>
    <View style={s.pageHeader}><Text style={s.heading}>Лента</Text>{status.data?.enabled &&
      <Button label="Новый пост" variant="primary" onPress={() => router.push("/(main)/feed/create" as Href)} />}</View>
    {status.data?.enabled !== true ? <View style={s.padding}><Status status={status} /></View> :
      <FlashList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <View style={s.listItem}><FeedPostCard post={item} /></View>}
        viewabilityConfig={visibility}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={s.list}
        onRefresh={() => { seen.current.clear(); void pages.refetch(); }}
        refreshing={pages.isRefetching}
        onEndReached={() => { if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={<View style={s.card}><Muted>{pages.isPending ? "Загрузка публикаций…" : pages.isError ? errorMessage(pages.error) : "Здесь пока нет публикаций."}</Muted></View>}
      />}
  </TexturedSafeAreaView>;
}
export function FeedComposeScreen() {
  const router = useRouter();
  const status = useFeedStatus();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [picked, setPicked] = useState<FeedPickedMedia[]>([]);
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([]);
  const copied = useRef(new Map<string, { requestId: string; mediaId?: string }>());
  const draft = useRef<string | null>(null);
  const requestId = useRef(Crypto.randomUUID());
  const completed = useRef(new Map<string, string>());
  const pick = async (source: "library" | "camera-photo" | "camera-video") => {
    try {
      const assets = await pickFeedMedia(source);
      const next = [...picked, ...assets];
      checkFeedPickedMedia(next);
      if (next.length + albumPhotoIds.length > FEED_LIMITS.maxAttachments) {
        throw new Error("Максимум 10 вложений.");
      }
      setPicked(next);
    } catch (error) { Alert.alert("Не удалось выбрать файл", errorMessage(error)); }
  };
  const move = (index: number, delta: number) => {
    setPicked(items => {
      const next = [...items], dest = index + delta;
      if (dest < 0 || dest >= next.length) return items;
      [next[index], next[dest]] = [next[dest]!, next[index]!];
      return next;
    });
  };
  const submit = async () => {
    if ((!text.trim() && !picked.length && !albumPhotoIds.length) || busy) return;
    setBusy(true);
    try {
      const created = draft.current ? await feedApi.getEditor(draft.current)
        : await feedApi.createPost({ clientRequestId: requestId.current });
      draft.current = created.id;
      const attachmentIds: string[] = [];
      for (const [index, asset] of picked.entries()) {
        setProgress(`Загружаем ${index + 1} из ${picked.length}…`);
        let id = completed.current.get(asset.requestId);
        if (!id) {
          id = await uploadPickedFeedMedia(created.id, asset);
          completed.current.set(asset.requestId, id);
        }
        attachmentIds.push(id);
      }
      for (const photoId of albumPhotoIds) {
        setProgress("Копируем фотографию из альбома…");
        const previous = copied.current.get(photoId) ?? { requestId: Crypto.randomUUID() };
        copied.current.set(photoId, previous);
        if (!previous.mediaId) {
          const result = await feedApi.copyAlbumPhoto(created.id, { photoId, clientRequestId: previous.requestId });
          previous.mediaId = result.id;
        }
        attachmentIds.push(previous.mediaId);
      }
      setProgress("Сохраняем публикацию…");
      await feedApi.saveRevision(created.id, {
        clientRequestId: Crypto.randomUUID(), expectedVersion: created.version,
        text, attachmentIds,
      });
      await feedApi.publishPost(created.id, { clientRequestId: Crypto.randomUUID() });
      router.replace(picked.length || albumPhotoIds.length ? "/(main)/(tabs)/feed" as Href
        : { pathname: "/(main)/feed/[postId]", params: { postId: created.id } } as Href);
    } catch (error) { Alert.alert("Не удалось опубликовать", errorMessage(error)); }
    finally { setBusy(false); setProgress(""); }
  };
  return <TexturedSafeAreaView style={s.screen} edges={["top","left","right"]}>
    <ScrollView contentContainerStyle={s.padding}>
      <View style={s.row}><Button label="Назад" variant="outline" onPress={() => router.back()} /></View>
      <Text style={s.heading}>Новая публикация</Text>
      {status.data?.enabled ? <View style={s.card}>
        <TextInput value={text} onChangeText={setText} multiline textAlignVertical="top"
          placeholder="Расскажите о своём питомце…" placeholderTextColor={COLORS.textSecondary}
          style={s.input} maxLength={10_000} />
        <Muted>{countFeedCharacters(text)} / {FEED_LIMITS.postCharacters}</Muted>
        <View style={s.row}>
          <Button label="Выбрать с устройства" variant="outline" disabled={busy} onPress={() => void pick("library")} />
          <Button label="Сделать фото" variant="outline" disabled={busy} onPress={() => void pick("camera-photo")} />
          <Button label="Снять видео" variant="outline" disabled={busy} onPress={() => void pick("camera-video")} />
        </View>
        {picked.map((asset, index) => <View style={s.row} key={asset.requestId}>
          <Muted>{index + 1}. {asset.filename} ({Math.ceil(asset.bytes / 1024)} КиБ)</Muted>
          <Pressable accessibilityRole="button" disabled={busy || index === 0} onPress={() => move(index, -1)}>
            <Text style={s.more}>↑</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy || index === picked.length - 1} onPress={() => move(index, 1)}>
            <Text style={s.more}>↓</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy}
            onPress={() => setPicked(items => items.filter(item => item.requestId !== asset.requestId))}>
            <Text style={s.more}>Убрать</Text>
          </Pressable>
        </View>)}
        <FeedAlbumPicker selected={albumPhotoIds} disabled={busy} onChange={ids => {
          if (ids.length + picked.length > FEED_LIMITS.maxAttachments) {
            Alert.alert("Слишком много вложений", "Максимум 10 вложений."); return;
          }
          setAlbumPhotoIds(ids);
        }} />
        {progress ? <Muted>{progress}</Muted> : null}
        <Button label={busy ? "Публикуем…" : "Опубликовать"} variant="primary"
          disabled={busy || (!text.trim() && !picked.length && !albumPhotoIds.length) || countFeedCharacters(text) > FEED_LIMITS.postCharacters}
          onPress={() => void submit()} />
      </View> : <Status status={status} />}
    </ScrollView>
  </TexturedSafeAreaView>;
}
export function FeedDetailScreen({ id, commentId }: { id: string; commentId?: string }) {
  const router = useRouter();
  const status = useFeedStatus();
  const userId = useAuthStore(state => state.user?.id);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const post = useQuery({ queryKey: ["feed","post",id,userId], queryFn: () => feedApi.getPost(id), refetchInterval: 90_000, enabled: status.data?.enabled === true });
  const comments = useInfiniteQuery({ queryKey: ["feed","comments",id,userId],
    queryFn: ({ pageParam }) => feedApi.listComments(id, { cursor: pageParam }),
    initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor,
    enabled: status.data?.enabled === true });
  const focused = useQuery({ queryKey: ["feed", "comment", commentId, userId], queryFn: () => feedApi.getComment(commentId!), enabled: !!commentId && status.data?.enabled === true, retry: false });
  const scroll = useRef<ScrollView>(null);
  const focusedY = useRef(0);
  useEffect(() => {
    if (focused.data?.postId === id) scroll.current?.scrollTo({ y: focusedY.current, animated: true });
  }, [focused.data, id]);
  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await feedApi.createComment(id, { text: body, replyToId: replyTo, clientRequestId: Crypto.randomUUID() });
      setBody(""); setReplyTo(null);
      await client.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) { Alert.alert("Не удалось отправить", errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <TexturedSafeAreaView style={s.screen} edges={["top","left","right"]}>
    <ScrollView ref={scroll} contentContainerStyle={s.padding}>
      <Button label="Назад" variant="outline" onPress={() => router.back()} />
      {status.data?.enabled !== true ? <Status status={status} /> :
      <>
        {post.isPending && <Muted>Загрузка публикации…</Muted>}
        {post.isError && <Text style={s.error}>{errorMessage(post.error)}</Text>}
        {post.data && <FeedPostCard post={post.data} detailed />}
        <View style={s.card} onLayout={event => { focusedY.current = event.nativeEvent.layout.y; if (focused.data?.postId === id) scroll.current?.scrollTo({ y: focusedY.current, animated: true }); }}><Text style={s.heading}>Комментарии</Text>
          {commentId && <View accessibilityLabel="Комментарий из уведомления">
            <Text style={s.heading}>Комментарий из уведомления</Text>
            {focused.isPending && <Muted>Загрузка комментария…</Muted>}
            {(focused.isError || (focused.data && focused.data.postId !== id)) && <Muted>Комментарий недоступен.</Muted>}
            {focused.data?.postId === id && <CommentRow item={focused.data} onReply={setReplyTo} />}
          </View>}
          {comments.isPending && <Muted>Загрузка комментариев…</Muted>}
          {comments.isError && <Text style={s.error}>{errorMessage(comments.error)}</Text>}
          {comments.data?.pages.flatMap(page => page.items).map(item => <CommentRow key={item.id} item={item} onReply={setReplyTo} />)}
          {comments.hasNextPage && <Button label="Ещё комментарии" variant="outline" disabled={comments.isFetchingNextPage} onPress={() => void comments.fetchNextPage()} />}
          {replyTo && <Button label="Отменить ответ" variant="outline" onPress={() => setReplyTo(null)} />}
          <TextInput value={body} onChangeText={setBody} multiline textAlignVertical="top" style={s.input} placeholder="Комментарий…" placeholderTextColor={COLORS.textSecondary} />
          <Button label="Отправить" variant="primary" disabled={busy || !body.trim() || countFeedCharacters(body) > FEED_LIMITS.commentCharacters} onPress={() => void send()} />
        </View>
      </>}
    </ScrollView>
  </TexturedSafeAreaView>;
}
function CommentRow({ item, onReply }: { item: FeedCommentDto; onReply: (id: string) => void }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const replies = useInfiniteQuery({
    queryKey: ["feed", "replies", item.id],
    queryFn: ({ pageParam }) => feedApi.listReplies(item.id, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: showReplies && !item.rootId,
  });
  const run = async (action: "edit" | "delete" | "reaction", reaction?: FeedReaction) => {
    setBusy(true);
    try {
      if (action === "edit") {
        await feedApi.editComment(item.id, { text: draft });
        setEditing(false);
      } else if (action === "delete") {
        await feedApi.deleteComment(item.id);
      } else if (reaction) {
        if (item.myReaction === reaction) await feedApi.removeCommentReaction(item.id);
        else await feedApi.setCommentReaction(item.id, reaction);
      }
      await cache.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) { Alert.alert("Комментарий", errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <View style={s.comment}>
    <Pressable accessibilityRole="button" onPress={() => router.push({
      pathname: "/profile/[username]", params: { username: item.author.username },
    } as Href)}>
      <Text style={s.authorName}>{item.author.name}</Text>
    </Pressable>
    <Muted>{formatFeedTime(item.createdAt)}{item.editedAt ? " · Изменён" : ""}</Muted>
    {item.replyToName && <Muted>Ответ для {item.replyToName}</Muted>}
    {editing ? <View style={{ gap: SPACING.sm }}>
      <TextInput style={s.input} multiline value={draft} onChangeText={setDraft}
        placeholder="Изменить комментарий" placeholderTextColor={COLORS.textSecondary} />
      <Button label="Сохранить" variant="primary"
        disabled={busy || !draft.trim() || countFeedCharacters(draft) > FEED_LIMITS.commentCharacters}
        onPress={() => void run("edit")} />
      <Button label="Отменить" variant="outline" onPress={() => setEditing(false)} />
    </View> : <Text style={s.body}>{item.deleted ? "Комментарий удалён" : item.text}</Text>}
    {!item.deleted && <>
      <View style={s.row}>
        <Pressable accessibilityRole="button" onPress={() => onReply(item.id)}>
          <Text style={s.more}>Ответить</Text>
        </Pressable>
        {item.canEdit && <Pressable disabled={busy} accessibilityRole="button"
          onPress={() => { setDraft(item.text); setEditing(true); }}>
          <Text style={s.more}>Изменить</Text>
        </Pressable>}
        {item.canDelete && <Pressable disabled={busy} accessibilityRole="button"
          onPress={() => Alert.alert("Удалить комментарий?", "Отменить удаление будет нельзя.", [
            { text: "Отмена", style: "cancel" },
            { text: "Удалить", style: "destructive", onPress: () => void run("delete") },
          ])}>
          <Text style={s.more}>Удалить</Text>
        </Pressable>}
      </View>
      <View style={s.reactions}>
        {FEED_REACTIONS.map(emoji => <Pressable key={emoji} accessibilityRole="button"
          accessibilityState={{ selected: item.myReaction === emoji }} disabled={busy}
          onPress={() => void run("reaction", emoji)}
          style={[s.reaction, item.myReaction === emoji && s.reactionSelected]}>
          <Text style={s.reactionText}>{emoji} {item.reactions.find(r => r.emoji === emoji)?.count ?? ""}</Text>
        </Pressable>)}
      </View>
    </>}
    {!item.rootId && item.replyCount > 0 && <Pressable accessibilityRole="button"
      onPress={() => setShowReplies(previous => !previous)}>
      <Text style={s.more}>{showReplies ? "Скрыть ответы" : `Ответы (${item.replyCount})`}</Text>
    </Pressable>}
    {showReplies && <>
      {replies.isPending && <Muted>Загружаем ответы…</Muted>}
      {replies.isError && <Button label="Повторить загрузку ответов" variant="outline"
        onPress={() => void replies.refetch()} />}
      {replies.data?.pages.flatMap(page => page.items).map(reply =>
        <CommentRow key={reply.id} item={reply} onReply={onReply} />)}
      {replies.hasNextPage && <Button label="Ещё ответы" variant="outline"
        disabled={replies.isFetchingNextPage} onPress={() => void replies.fetchNextPage()} />}
    </>}
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1 }, padding: { padding: SPACING.md, paddingBottom: 100, gap: SPACING.md },
  list: { paddingHorizontal: SPACING.md, paddingBottom: 80 }, listItem: { marginBottom: 14 },
  pageHeader: { paddingHorizontal: SPACING.md, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: COLORS.text, fontFamily: FONTS.montserratMedium, fontSize: 24 },
  card: { backgroundColor: COLORS.cardBackground, borderRadius: 20, padding: 16, gap: 12 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { height: 46, width: 46, borderRadius: 23 }, avatarFallback: { backgroundColor: "#e5e5cf", justifyContent: "center", alignItems: "center" },
  authorName: { color: COLORS.text, fontFamily: FONTS.montserratMedium, fontSize: 15 },
  text: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 15 },
  muted: { fontFamily: FONTS.montserrat, color: COLORS.textSecondary, fontSize: 12, lineHeight: 19 },
  body: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 15, lineHeight: 24 },
  more: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, justifyContent: "space-between", flexWrap: "wrap" },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reaction: { backgroundColor: "#F4F1E7", paddingHorizontal: 10, minHeight: 40, borderRadius: 18, justifyContent: "center" },
  reactionSelected: { backgroundColor: "#DCE5C6" },
  reactionText: { fontSize: 15 },
  carousel: { gap: 10 }, media: { width: 295, height: 250, backgroundColor: "#E6E0D2", borderRadius: 14, overflow: "hidden" },
  image: { width: "100%", height: "100%" }, videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 12, minHeight: 120, padding: 12, fontFamily: FONTS.montserrat, fontSize: 15, color: COLORS.text, backgroundColor: "#FFFEF9" },
  error: { color: "#95283B", fontFamily: FONTS.montserrat },
  comment: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight, paddingTop: 12, gap: 4 },
});

import { FeedPostActions, FeedReportButton } from "./FeedPostActions";
import { publicationPhaseLabel, type PublicationItem } from "@gafus/core/services/feed/publication-client";
import { mobileFeedPublications } from "./publication";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, useRouter, useFocusEffect, type Href } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FEED_REACTIONS, FEED_LIMITS, countFeedCharacters, formatFeedTime, validateFeedPollDraft,
  getFeedAuthorRoleBadge,
  type FeedPostDto, type FeedCommentDto, type FeedReaction, type FeedReactionCountDto, type FeedMediaDto, type FeedSort, type FeedImpressionInput,
} from "@gafus/types";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { Button } from "@/shared/components";
import { feedApi } from "@/shared/lib/api/feed";
import { pickFeedMedia, pickFeedPollOptionPhoto, uploadPickedFeedMedia, checkFeedPickedMedia, type FeedPickedMedia } from "./uploads";
import { stopFeedVideoOutsidePosts } from "./FeedVideo";
import { mobileFeedTelemetry } from "./telemetry";
import { FeedMediaViewer } from "./FeedMediaViewer";
import { getFeedPreviewHeight } from "./feedMediaLayout";
import { GafusReactionProgress } from "./GafusReactionProgress";
import { FeedAlbumPicker } from "./FeedAlbumPicker";
import { FeedCarouselDots } from "./FeedCarouselDots";
import { FeedPublicationProgress } from "./FeedPublicationProgress";
import { FeedPollCard } from "./FeedPollCard";
import { FeedPollComposer, type MobileFeedPollDraft } from "./FeedPollComposer";
import { FeedSortControl } from "./FeedSortControl";
import { FeedSmartPreferences } from "./FeedSmartPreferences";
import { SortableMediaStrip } from "./SortableMediaStrip";
import { composeToolIconUri } from "./composeToolIconData";
import { BOOKMARK_ARTWORK_URI } from "./bookmarkArtwork";
import { MOMENTS_HEADER_URI } from "./momentsHeaderArtwork";

const EMPTY_PUBLICATIONS: PublicationItem[] = [];

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Не удалось загрузить «Моменты»."; }
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
  if (status.isPending) return <Loading variant="inline" />;
  if (status.isError) return <View style={s.card}><Text style={s.error}>{errorMessage(status.error)}</Text><Button label="Повторить" onPress={() => void (retry?.() ?? status.refetch())} /></View>;
  return <View style={s.card}><Muted>Раздел «Моменты» пока недоступен.</Muted></View>;
}
// Telegram-style reactions: show only used reactions and keep the picker behind one compact button.
function FeedReactionStrip({ reactions, myReaction, busy, onSelect }: {
  reactions: readonly FeedReactionCountDto[];
  myReaction: FeedReaction | null;
  busy: boolean;
  onSelect: (emoji: FeedReaction) => Promise<void>;
}) {
  const triggerRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const openPicker = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setPickerOpen(true);
    });
  };
  const paletteWidth = Math.min(242, screenWidth - 24);
  const paletteHeight = 58;
  const left = anchor
    ? Math.max(12, Math.min(screenWidth - paletteWidth - 12, anchor.x + anchor.width / 2 - paletteWidth / 2))
    : 12;
  const minimumTop = insets.top + 8;
  const maximumTop = Math.max(minimumTop, screenHeight - insets.bottom - paletteHeight - 8);
  const preferredTop = anchor
    ? (anchor.y - paletteHeight - 8 >= minimumTop
      ? anchor.y - paletteHeight - 8
      : anchor.y + anchor.height + 8)
    : minimumTop;
  const top = Math.max(minimumTop, Math.min(maximumTop, preferredTop));
  const used = FEED_REACTIONS.filter(emoji =>
    reactions.some(reaction => reaction.emoji === emoji && reaction.count > 0) || myReaction === emoji,
  );
  return <>
    <View style={s.compactReactions}>
      {used.map(emoji => {
        const count = reactions.find(reaction => reaction.emoji === emoji)?.count ?? 0;
        return <Pressable key={emoji} accessibilityRole="button"
          accessibilityLabel={`Реакция ${emoji}, ${count}`}
          accessibilityState={{ selected: myReaction === emoji, disabled: busy }}
          disabled={busy} hitSlop={6} onPress={event => {
            event.stopPropagation();
            void onSelect(emoji);
          }}
          style={[s.reactionPill, myReaction === emoji && s.reactionPillSelected]}>
          <Text style={s.reactionEmoji}>{emoji}</Text>
          {count > 0 && <Text style={s.reactionCount}>{count}</Text>}
        </Pressable>;
      })}
      <Pressable ref={triggerRef} accessibilityRole="button" accessibilityLabel="Добавить реакцию"
        disabled={busy} hitSlop={6} onPress={event => {
          event.stopPropagation();
          openPicker();
        }} style={s.addReaction}>
        <MaterialCommunityIcons name="heart-outline" size={22} color={COLORS.primary} />
      </Pressable>
    </View>
    {pickerOpen && anchor && <Modal visible transparent statusBarTranslucent animationType="fade"
      onRequestClose={() => setPickerOpen(false)}>
      <View style={s.reactionModal}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
          accessibilityLabel="Закрыть выбор реакции" onPress={() => setPickerOpen(false)} />
        <View style={[s.reactionPalette, { width: paletteWidth, left, top }]}
          accessibilityLabel="Выберите реакцию">
          {FEED_REACTIONS.map(emoji => (
            <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Реакция ${emoji}`}
              onPress={() => { setPickerOpen(false); void onSelect(emoji); }}
              style={[s.reactionPaletteItem, myReaction === emoji && s.reactionPillSelected]}>
              <Text style={s.reactionPaletteEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>}
  </>;
}
export function FeedPostCard({ post, detailed = false }: { post: FeedPostDto; detailed?: boolean }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [mediaPosition, setMediaPosition] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaWidth, setMediaWidth] = useState(320);
  const { height: viewportHeight } = useWindowDimensions();
  useEffect(() => { setMediaPosition(0); setViewerIndex(null); }, [post.id]);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const recordOpen = (kind: "post_open" | "profile_open") => {
    if (post.recommendationExposureToken && post.recommendationSessionId &&
        post.recommendationRank !== undefined) {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) return;
      const telemetry = mobileFeedTelemetry(userId);
      telemetry.enqueueOutcome({
        eventId: Crypto.randomUUID(), postId: post.id,
        rankingSessionId: post.recommendationSessionId,
        algorithmVersion: "smart-rule-2026-10-a",
        exposureToken: post.recommendationExposureToken,
        rank: post.recommendationRank, kind,
      });
      void telemetry.flush();
    }
  };
  const go = () => {
    recordOpen("post_open");
    router.push({ pathname: "/(main)/feed/[postId]", params: { postId: post.id } } as Href);
  };
  const deletePost = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await feedApi.deletePost(post.id);
      await cache.invalidateQueries({ queryKey: ["feed"] });
      if (detailed) router.replace("/(main)/(tabs)/feed" as Href);
    } catch (error) {
      Alert.alert("Не удалось удалить публикацию", errorMessage(error));
    } finally {
      setActionBusy(false);
    }
  };
  const react = async (reaction: FeedReaction) => {
    setBusy(true);
    try {
      if (post.myReaction === reaction) await feedApi.removePostReaction(post.id);
      else await feedApi.setPostReaction(post.id, reaction);
      await cache.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) { Alert.alert("Моменты", errorMessage(error)); }
    finally { setBusy(false); }
  };
  const media = post.attachments.filter(asset => asset.status === "ready");
  const currentMediaPosition = Math.min(mediaPosition, Math.max(0, media.length - 1));
  const updateMediaPosition = (offset: number) => {
    if (!media.length || !Number.isFinite(offset)) return;
    const next = Math.min(media.length - 1,
      Math.max(0, Math.round(offset / (mediaWidth + 8))));
    setMediaPosition(previous => previous === next ? previous : next);
  };
  // One stable frame per carousel (based on the first attachment); all images
  // fit inside it without cropping, including portrait and panoramic photos.
  const firstMedia = media[0];
  const mediaHeight = getFeedPreviewHeight(
    mediaWidth, firstMedia?.width, firstMedia?.height, viewportHeight,
  );
  return <Pressable
    style={[s.postCard, detailed && s.postCardDetailed]}
    accessible={false}
    disabled={detailed}
    onPress={go}
    onLayout={event => {
      const width = Math.max(1, event.nativeEvent.layout.width - (detailed ? 24 : 0));
      setMediaWidth(current => Math.abs(current - width) > 1 ? width : current);
    }}>
    <View style={s.postAuthorBar}>
    <Pressable style={s.authorRow} accessibilityRole="button" accessibilityLabel={`Профиль ${post.author.name}`} onPress={event => {
      event.stopPropagation();
      recordOpen("profile_open");
      router.push({ pathname: "/profile/[username]", params: { username: post.author.username } } as Href);
    }}>
      {post.author.avatarUrl ? <Image source={{ uri: post.author.avatarUrl }} style={s.avatar} cachePolicy="memory" /> :
        <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarInitial}>{post.author.name.slice(0, 1)}</Text></View>}
      <View style={s.authorInfo}>
        <View style={s.authorIdentity}>
          <Text style={s.authorName} numberOfLines={1}>{post.author.name}</Text>
          {getFeedAuthorRoleBadge(post.author.role) && (
            <View style={[s.authorRoleBadge,
              post.author.role === "ADMIN" ? s.authorRoleAdmin : s.authorRoleTrainer]}>
              <Text style={[s.authorRoleText,
                post.author.role === "ADMIN" ? s.authorRoleTextAdmin : s.authorRoleTextTrainer]}>
                {getFeedAuthorRoleBadge(post.author.role)}
              </Text>
            </View>
          )}
        </View>
        <Muted>{formatFeedTime(post.publishedAt ?? post.createdAt)}{post.editedAt ? " · Изменён" : ""}</Muted>
      </View>
    </Pressable>
    <FeedPostActions post={post} onEdit={() => router.push({ pathname: "/(main)/feed/create", params: { edit: post.id } } as Href)} onDelete={() => Alert.alert("Удалить публикацию?", "Публикация исчезнет из раздела «Моменты».", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => void deletePost() }])} />
    </View>
    {post.moderationState && post.moderationState !== "visible" && <Text style={s.error}>
      {post.moderationState === "removed" ? "Публикация удалена" : "Публикация скрыта"} из-за жалобы. {post.moderationReason}
    </Text>}
    {(!post.moderationState || post.moderationState === "visible") && !!media.length && <ScrollView key={post.id} horizontal snapToInterval={mediaWidth + 8} decelerationRate="fast" showsHorizontalScrollIndicator={false}
      style={!detailed && s.feedCarousel}
      contentContainerStyle={s.carousel} onScrollBeginDrag={() => stopFeedVideoOutsidePosts(new Set())}
      scrollEventThrottle={32}
      onScroll={event => updateMediaPosition(event.nativeEvent.contentOffset.x)}
      onMomentumScrollEnd={event => updateMediaPosition(event.nativeEvent.contentOffset.x)}>
      {media.map((asset, index) => <View style={[s.media, { width: mediaWidth, height: mediaHeight }]} key={asset.id}>
        <Pressable style={s.image} onPress={event => {
          event.stopPropagation();
          setViewerIndex(index);
        }}
          accessibilityRole="button"
          accessibilityLabel={asset.kind === "photo" ? `Открыть фото ${index + 1} на весь экран` : `Открыть видео ${index + 1} на весь экран`}>
          {asset.kind === "photo" && (asset.fullUrl || asset.thumbUrl) ? (
            <CdnImage cdnUrl={asset.fullUrl ?? asset.thumbUrl ?? ""}
              requestFallback={() => feedApi.requestMediaFallback(asset.id, asset.fullUrl ? "full" : "thumb")}
              contentFit="contain" style={s.image} />
          ) : (
            <>
              {!!asset.posterUrl && <CdnImage cdnUrl={asset.posterUrl} requestFallback={() => feedApi.requestMediaFallback(asset.id, "poster")}
                contentFit="contain" style={s.image} />}
              <View style={s.videoPlayOverlay} pointerEvents="none">
                <View style={s.videoPlayCircle}>
                  <MaterialCommunityIcons name="play" size={32} color="#FFF8EB" />
                </View>
              </View>
            </>
          )}
        </Pressable>
      </View>)}
    </ScrollView>}
    {viewerIndex !== null && media.length > 0 && (
      <FeedMediaViewer
        postId={post.id}
        initialMedia={media}
        start={viewerIndex}
        close={() => setViewerIndex(null)}
      />
    )}
    <FeedCarouselDots count={media.length} position={currentMediaPosition} />
    {post.text && !(post.hasPoll && post.text === "Опрос") ? (
      <View>
        <Text style={[s.body, detailed && s.bodyDetailed]} numberOfLines={detailed || expanded ? undefined : 4}>
          {post.text}
        </Text>
        {!detailed && post.text.length > 80 && (
          <Pressable
            style={s.expandText}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Свернуть текст публикации" : "Развернуть текст публикации"}
            onPress={event => {
              event.stopPropagation();
              setExpanded(value => !value);
            }}>
            <Text style={s.more}>{expanded ? "Свернуть" : "Ещё"}</Text>
          </Pressable>
        )}
      </View>
    ) : null}
    {post.hasPoll && (
      <Pressable accessible={false} onPress={event => event.stopPropagation()}>
        <FeedPollCard postId={post.id} />
      </Pressable>
    )}
    <View style={s.postFooter}>
      <FeedReactionStrip reactions={post.reactions} myReaction={post.myReaction}
        busy={busy} onSelect={react} />
      <View style={s.postStats}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Комментарии: ${post.commentCount}`}
          onPress={event => {
            event.stopPropagation();
            go();
          }} style={s.postStat}>
          <MaterialCommunityIcons name="comment-outline" size={17} color={COLORS.primary} />
          <Text style={s.postStatText}>{post.commentCount}</Text>
        </Pressable>
        <View style={s.postStat} accessibilityLabel={`Просмотров: ${post.viewCount}`}>
          <MaterialCommunityIcons name="eye-outline" size={17} color={COLORS.textSecondary} />
          <Text style={s.postStatText}>{post.viewCount}</Text>
        </View>
      </View>
    </View>
  </Pressable>;
}
function FeedPublicationQueue({ ownerId }: { ownerId?: string }) {
  const router = useRouter();
  const local = useSyncExternalStore(mobileFeedPublications.subscribe,
    mobileFeedPublications.getSnapshot, () => EMPTY_PUBLICATIONS)
    .filter(item => item.ownerId === ownerId);
  const pending = useQuery({
    queryKey: ["feed", "pending", ownerId],
    queryFn: () => feedApi.listPendingPosts(),
    enabled: !!ownerId,
    refetchInterval: 20_000,
  });
  const recovered = (pending.data?.items ?? [])
    .filter(post => !local.some(item => item.postId === post.id));
  if (!local.length && !recovered.length) return null;
  return <View style={s.publicationQueue} accessibilityLabel="Мои публикации в обработке">
    {local.map(item => <View key={item.id} style={s.publicationCard}>
      <View style={s.publicationMedia}>
        {item.previewUri && <Image source={{ uri: item.previewUri }} style={s.publicationPreview}
          contentFit="cover" />}
        {(item.phase === "uploading" || item.phase === "processing") &&
          <ActivityIndicator size="small" color={COLORS.primary}
            accessibilityLabel="Обрабатываем публикацию" />}
      </View>
      <View style={s.publicationBody} accessibilityLiveRegion="polite">
        <Text style={s.publicationTitle}>{publicationPhaseLabel(item)}</Text>
        {!!item.text && <Text numberOfLines={2} style={s.publicationExcerpt}>{item.text}</Text>}
        {(item.phase === "uploading" || item.phase === "processing") && (
          <FeedPublicationProgress phase={item.phase} progress={item.progress} />
        )}
        {!!item.error && <Text style={s.error}>{item.error}</Text>}
        {item.phase === "failed" && <View style={s.publicationActions}>
          <Button label="Повторить" height={38} fontSize={12} variant="primary" fullWidth={false}
            onPress={() => mobileFeedPublications.retry(item.id)} />
          <Pressable accessibilityRole="button" onPress={() => mobileFeedPublications.dismiss(item.id)}
            style={s.publicationDismiss}><Text style={s.publicationExcerpt}>Скрыть</Text></Pressable>
        </View>}
      </View>
    </View>)}
    {recovered.map(post => <Pressable key={post.id} style={s.publicationCard}
      accessibilityRole="button" accessibilityLabel="Продолжить незавершённую публикацию"
      onPress={() => router.push({ pathname: "/(main)/feed/create", params: { edit: post.id } } as Href)}>
      <MaterialCommunityIcons name="file-document-edit-outline" size={26} color={COLORS.primary} />
      <View style={s.publicationBody}>
        <Text style={s.publicationTitle}>{post.status === "pending"
          ? "Обрабатываем публикацию…" : post.status === "failed"
            ? "Ошибка обработки" : "Черновик публикации"}</Text>
        {!!post.text && <Text style={s.publicationExcerpt} numberOfLines={2}>{post.text}</Text>}
        {post.status === "pending" && <FeedPublicationProgress phase="processing" />}
      </View>
    </Pressable>)}
  </View>;
}

export function FeedScreen() {
  const router = useRouter();
  const [smartSettingsOpen, setSmartSettingsOpen] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const compactControls = screenWidth < 360;
  const [sort, setSort] = useState<FeedSort>("new");
  const userId = useAuthStore(state => state.user?.id);
  const status = useFeedStatus();
  const feedCache = useQueryClient();
  const publishing = useSyncExternalStore(mobileFeedPublications.subscribe,
    mobileFeedPublications.getSnapshot, () => EMPTY_PUBLICATIONS)
    .some(item => item.ownerId === userId && item.phase !== "published");
  useEffect(() => {
    const seen = new Set<string>();
    return mobileFeedPublications.subscribe(() => {
      for (const item of mobileFeedPublications.getSnapshot()) {
        if (item.ownerId !== userId || item.phase !== "published" || !item.postId || seen.has(item.id)) continue;
        seen.add(item.id);
        void feedCache.invalidateQueries({ queryKey: ["feed"] });
      }
    });
  }, [feedCache, userId]);
  useEffect(() => {
    let active = true;
    if (!userId) { setSort("new"); return; }
    void AsyncStorage.getItem(`gafus:feed:sort:${userId}`).then(value => {
      if (!active) return;
      if (value === "new" || value === "popular" || value === "discussed" ||
        (value === "smart" && status.data?.smartEnabled)) setSort(value);
      else setSort(status.data?.smartEnabled ? "smart" : "new");
    }).catch(() => {});
    return () => { active = false; };
  }, [userId, status.data?.smartEnabled]);
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
    queryKey: ["feed", "posts", userId, sort],
    queryFn: ({ pageParam }) => feedApi.listPosts({ cursor: pageParam, sort }),
    refetchInterval: 90_000,
    initialPageParam: null as string | null,
    getNextPageParam: value => value.nextCursor,
    enabled: !!userId && status.data?.enabled === true,
  });
  const posts = pages.data?.pages.flatMap(page => page.items) ?? [];
  const smartSession = useRef<{ id: string; algorithmVersion: string } | null>(null);
  useEffect(() => {
    const meta = pages.data?.pages[0]?.feedMeta;
    smartSession.current = sort === "smart" && meta?.rankingSessionId && meta.algorithmVersion
      ? { id: meta.rankingSessionId, algorithmVersion: meta.algorithmVersion } : null;
  }, [pages.data, sort]);
  const telemetry = userId ? mobileFeedTelemetry(userId) : null;
  const flushImpressions = useCallback(() => telemetry?.flush() ?? Promise.resolve(true), [telemetry]);
  useEffect(() => { if (telemetry) void telemetry.flush(); }, [telemetry]);
  const dwellMap = useRef(new Map<string, { since: number; post: FeedPostDto }>());
  const flushDwell = useCallback(() => {
    const ended = [...dwellMap.current.values()];
    dwellMap.current.clear();
    if (!ended.length) return;
    flushImpressions();
    const events = ended.flatMap(({ since, post }) => {
      if (!post.recommendationSessionId || !post.recommendationExposureToken ||
          post.recommendationRank === undefined) return [];
      return [{
        eventId: Crypto.randomUUID(), postId: post.id,
        rankingSessionId: post.recommendationSessionId,
        algorithmVersion: "smart-rule-2026-10-a" as const,
        exposureToken: post.recommendationExposureToken,
        rank: post.recommendationRank, kind: "dwell" as const,
        durationMs: Math.min(120_000, Math.max(0, Date.now() - since)),
      }];
    });
    for (const event of events.slice(0, 30)) telemetry?.enqueueOutcome(event);
    if (events.length) void flushImpressions();
  }, [flushImpressions, telemetry]);
  useEffect(() => {
    const timer = setInterval(flushImpressions, 5_000);
    const sub = AppState.addEventListener("change", state => {
      if (state !== "active") { flushDwell(); void flushImpressions(); }
      else void flushImpressions();
    });
    return () => { clearInterval(timer); sub.remove(); flushImpressions(); flushDwell(); };
  }, [flushImpressions, flushDwell]);
  useFocusEffect(useCallback(() => {
    return () => { flushImpressions(); flushDwell(); };
  }, [flushImpressions, flushDwell]));
  const visibility = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: FEED_LIMITS.viewVisibleMilliseconds }).current;
  const seen = useRef(new Set<string>());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: FeedPostDto | null; isViewable: boolean }[] }) => {
    stopFeedVideoOutsidePosts(new Set(viewableItems.filter(entry => entry.isViewable && entry.item).map(entry => entry.item!.id)));
    if (!screenFocused.current || !appActive.current) return;
    const visibleIds = new Set(viewableItems.filter(entry => entry.isViewable && entry.item).map(entry => entry.item!.id));
    const elapsed: Array<{ since: number; post: FeedPostDto }> = [];
    for (const [id, value] of dwellMap.current) {
      if (!visibleIds.has(id)) { elapsed.push(value); dwellMap.current.delete(id); }
    }
    if (elapsed.length) {
      flushImpressions();
      const events = elapsed.flatMap(({ since, post }) =>
        post.recommendationSessionId && post.recommendationExposureToken &&
        post.recommendationRank !== undefined ? [{
          eventId: Crypto.randomUUID(), postId: post.id,
          rankingSessionId: post.recommendationSessionId,
          algorithmVersion: "smart-rule-2026-10-a" as const,
          exposureToken: post.recommendationExposureToken, rank: post.recommendationRank,
          kind: "dwell" as const, durationMs: Math.min(120_000, Math.max(0, Date.now() - since)),
        }] : [],
      );
      for (const event of events.slice(0, 30)) telemetry?.enqueueOutcome(event);
      if (events.length) void flushImpressions();
    }
    for (const { item, isViewable } of viewableItems) {
      if (item && isViewable && item.recommendationExposureToken && !dwellMap.current.has(item.id)) {
        dwellMap.current.set(item.id, { since: Date.now(), post: item });
      }
      if (!item || !isViewable || item.author.id === userId || seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      void feedApi.recordView(item.id).catch(() => seen.current.delete(item.id));
      const session = smartSession.current;
      const sessionId = item.recommendationSessionId ?? session?.id;
      if (sort === "smart" && session && sessionId && item.recommendationRank !== undefined) {
        telemetry?.enqueueImpression({
          eventId: Crypto.randomUUID(), postId: item.id,
          rankingSessionId: sessionId, algorithmVersion: session.algorithmVersion,
          rank: item.recommendationRank, visibleMs: FEED_LIMITS.viewVisibleMilliseconds,
          exposureToken: item.recommendationExposureToken,
        });
        if ((telemetry?.impressions.size ?? 0) >= 25) void flushImpressions();
      }
    }
  }, [userId, sort, flushImpressions, telemetry]);
  const listHeader = <>
    <View style={s.momentsHeaderArtwork}>
      <Image
        source={{ uri: MOMENTS_HEADER_URI }}
        style={s.momentsHeaderImage}
        contentFit="cover"
        accessible
        accessibilityLabel="Моменты. Делитесь фотографиями, видео и историями о своих питомцах"
      />
    </View>
    <View style={[s.pageHeader, compactControls && s.pageHeaderCompact]}>
      {status.data?.enabled && <FeedSortControl value={sort} compact={compactControls}
        smartEnabled={status.data?.smartEnabled} onSettings={() => setSmartSettingsOpen(true)} onChange={next => {
        if (next !== sort) {
          flushImpressions();
          flushDwell();
          seen.current.clear();
          stopFeedVideoOutsidePosts(new Set());
          setSort(next);
          if (userId) void AsyncStorage.setItem(`gafus:feed:sort:${userId}`, next);
        }
      }} />}
      {status.data?.enabled && <View style={[s.headerActions, compactControls && s.headerActionsCompact]}>
        <View style={[s.bookmarksButton, compactControls && s.bookmarksButtonCompact]}>
          <Button
            label=" "
            variant="caramel"
            accessibilityLabel="Избранные"
            accessibilityHint="Открыть сохранённые публикации"
            onPress={() => router.push("/(main)/feed/saved" as Href)}
            fullWidth
            height={44}
            horizontalPadding={0}
            verticalPadding={0}
            borderRadius={14}
            style={s.bookmarksButtonBackground}
            animatedPress
          />
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={s.bookmarksContent}
          >
            <Image
              source={{ uri: BOOKMARK_ARTWORK_URI }}
              style={[s.bookmarksIcon, compactControls && s.bookmarksIconCompact]}
              contentFit="contain"
              accessible={false}
            />
            <Text style={[s.bookmarksText, compactControls && s.bookmarksTextCompact]} numberOfLines={1} adjustsFontSizeToFit>Избранные</Text>
          </View>
        </View>
        <View style={[s.newPostButton, compactControls && s.newPostButtonCompact]}>
          <Button
            label=" "
            variant="primary"
            accessibilityLabel="Новый пост"
            accessibilityHint="Создать публикацию"
            onPress={() => router.push("/(main)/feed/create" as Href)}
            fullWidth
            height={44}
            horizontalPadding={0}
            verticalPadding={0}
            borderRadius={14}
            style={s.newPostButtonBackground}
            animatedPress
          />
          <View style={s.newPostIcon} pointerEvents="none" accessible={false}
            importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="plus" size={25} color="#F6F0DF" />
          </View>
        </View>
      </View>}
    </View>
    <FeedPublicationQueue ownerId={userId} />
    {sort === "smart" && pages.data?.pages.some(page => page.feedMeta?.fallback === "new") &&
      <Text style={[s.muted, { paddingHorizontal: 16, paddingBottom: 9 }]}>
        Рекомендации пока недоступны. Показываем новые публикации.
      </Text>}
  </>;
  return <TexturedSafeAreaView style={s.screen} edges={[]}>
    <StatusBar style="dark" translucent backgroundColor="transparent" />
    {status.isPending ? <Loading fullScreen embedded /> :
      status.data?.enabled !== true ? <View style={s.padding}>{listHeader}<Status status={status} /></View> :
      <FlashList
        key={sort}
        data={posts}
        ListHeaderComponent={listHeader}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <View style={s.listItem}><FeedPostCard post={item} /></View>}
        viewabilityConfig={visibility}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={s.list}
        onRefresh={() => { seen.current.clear(); void pages.refetch(); }}
        refreshing={pages.isRefetching}
        onEndReached={() => { if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={pages.isFetchingNextPage ? <MascotSpinner /> : null}
        ListEmptyComponent={pages.isPending
          ? <Loading variant="inline" message="Загрузка публикаций…" />
          : publishing ? null
          : <View style={s.card}><Muted>{pages.isError ? errorMessage(pages.error) : "Здесь пока нет публикаций."}</Muted></View>}
      />}
    <FeedSmartPreferences visible={smartSettingsOpen} onClose={() => setSmartSettingsOpen(false)} />
  </TexturedSafeAreaView>;
}
export function FeedComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string | string[] }>();
  const editId = typeof edit === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(edit) ? edit : undefined;
  const isEditing = !!editId;
  const userId = useAuthStore(state => state.user?.id);
  const cache = useQueryClient();
  const status = useFeedStatus();
  const original = useQuery({
    queryKey: ["feed", "editor", editId, userId],
    queryFn: () => feedApi.getEditor(editId!),
    enabled: !!editId && status.data?.enabled === true,
    retry: 1,
  });
  const [text, setText] = useState("");
  const [poll, setPoll] = useState<MobileFeedPollDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [picked, setPicked] = useState<FeedPickedMedia[]>([]);
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([]);
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const [existingMediaIds, setExistingMediaIds] = useState<string[]>([]);
  const hydratedEditor = useRef<string | null>(null);
  const copied = useRef(new Map<string, { requestId: string; mediaId?: string }>());
  const draft = useRef<string | null>(null);
  const requestId = useRef(Crypto.randomUUID());
  const completed = useRef(new Map<string, string>());
  useEffect(() => {
    if (!editId || !original.data || hydratedEditor.current === editId) return;
    hydratedEditor.current = editId;
    setText(original.data.pendingRevision?.text ?? original.data.text);
    setExistingMediaIds(original.data.pendingRevision?.attachmentIds ??
      original.data.attachments.map(asset => asset.id));
    draft.current = editId;
  }, [editId, original.data]);
  const existingMedia = (original.data?.attachments ?? [])
    .filter(asset => existingMediaIds.includes(asset.id))
    .sort((a, b) => existingMediaIds.indexOf(a.id) - existingMediaIds.indexOf(b.id));
  const attachedCount = existingMediaIds.length + picked.length + albumPhotoIds.length;
  const existingVideoCount = existingMedia.filter(asset => asset.kind === "video").length;
  const canSubmit = (!isEditing || (!!original.data && original.data.canEdit)) &&
    (Boolean(text.trim()) || attachedCount > 0 || !!poll) &&
    countFeedCharacters(text) <= FEED_LIMITS.postCharacters;
  const pick = async (source: "library" | "camera-photo" | "camera-video") => {
    try {
      const assets = await pickFeedMedia(source);
      const next = [...picked, ...assets];
      checkFeedPickedMedia(next);
      if (next.length + albumPhotoIds.length + existingMediaIds.length > FEED_LIMITS.maxAttachments) {
        throw new Error("Максимум 10 вложений.");
      }
      if (existingVideoCount + next.filter(item => item.kind === "video").length > FEED_LIMITS.maxVideos) {
        throw new Error("Максимум три видео.");
      }
      setPicked(next);
    } catch (error) { Alert.alert("Не удалось выбрать файл", errorMessage(error)); }
  };
  const move = (index: number, destination: number) => {
    setPicked(items => {
      if (index === destination || index < 0 || index >= items.length ||
          destination < 0 || destination >= items.length) return items;
      const next = [...items];
      const [item] = next.splice(index, 1);
      if (!item) return items;
      next.splice(destination, 0, item);
      return next;
    });
  };
  const moveExisting = (index: number, destination: number) => {
    setExistingMediaIds(items => {
      if (index === destination || index < 0 || index >= items.length ||
          destination < 0 || destination >= items.length) return items;
      const next = [...items];
      const [item] = next.splice(index, 1);
      if (!item) return items;
      next.splice(destination, 0, item);
      return next;
    });
  };
  const choosePollImage = async (index: number) => {
    try {
      const photo = await pickFeedPollOptionPhoto();
      if (!photo) return;
      setPoll(current => current ? {
        ...current, options: current.options.map((option, i) =>
          i === index ? { ...option, imageAsset: photo } : option),
      } : current);
    } catch (error) { Alert.alert("Не удалось выбрать фото", errorMessage(error)); }
  };
  const removePollImage = (index: number) => {
    setPoll(current => current ? {
      ...current, options: current.options.map((option, i) =>
        i === index ? { ...option, imageAsset: undefined } : option),
    } : current);
  };
  const submit = async () => {
    if (!canSubmit || busy || (isEditing && original.isPending)) return;
    if (poll) {
      const issue = validateFeedPollDraft(poll);
      if (issue) { Alert.alert("Проверьте опрос", issue); return; }
      const count = poll.options.filter(option => option.imageAsset).length;
      if (count + picked.length + existingMediaIds.length + albumPhotoIds.length > FEED_LIMITS.maxAttachments) {
        Alert.alert("Слишком много фото", "Всего можно добавить максимум 10 вложений, включая варианты опроса.");
        return;
      }
    }
    setBusy(true);
    if (!isEditing) {
      try {
        mobileFeedPublications.enqueue({
          ownerId: userId!, text,
          files: picked.map(asset => ({
            ...asset, previewUri: asset.kind === "photo" ? asset.uri : undefined,
          })),
          albumPhotoIds,
          ...(poll ? {
            poll: { ...poll, options: poll.options.map(({ imageAsset: _imageAsset, ...option }) => option) },
            pollOptionImages: poll.options.flatMap((option, optionIndex) =>
              option.imageAsset ? [{ optionIndex, asset: {
                ...option.imageAsset, previewUri: option.imageAsset.uri,
              } }] : []),
          } : {}),
        });
        router.replace("/(main)/(tabs)/feed" as Href);
      } catch (error) {
        Alert.alert("Не удалось опубликовать", errorMessage(error));
        setBusy(false);
      }
      return;
    }
    try {
      const created = draft.current ? await feedApi.getEditor(draft.current)
        : await feedApi.createPost({ clientRequestId: requestId.current });
      if (isEditing && !created.canEdit) throw new Error("Время редактирования публикации истекло.");
      draft.current = created.id;
      const attachmentIds: string[] = isEditing ? [...existingMediaIds] : [];
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
      await cache.invalidateQueries({ queryKey: ["feed"] });
      router.replace(isEditing || (!picked.length && !albumPhotoIds.length)
        ? { pathname: "/(main)/feed/[postId]", params: { postId: created.id } } as Href
        : "/(main)/(tabs)/feed" as Href);
    } catch (error) { Alert.alert(isEditing ? "Не удалось сохранить изменения" : "Не удалось опубликовать", errorMessage(error)); }
    finally { setBusy(false); setProgress(""); }
  };
  return <TexturedSafeAreaView style={s.screen} edges={["left","right"]}>
    <StatusBar style="dark" translucent backgroundColor="transparent" />
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[s.composeTopBar, { paddingTop: insets.top + 8 }]}>
      <AppBackButton onPress={() => router.back()} />
      <Text accessibilityRole="header" numberOfLines={1} style={s.composeTopTitle}>
        {isEditing ? "Редактирование публикации" : "Новая публикация"}
      </Text>
    </View>
    <ScrollView
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={s.composeContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      {status.isPending ? <Loading variant="inline" message="Проверяем доступность «Моментов»…" /> :
        status.data?.enabled ? isEditing && original.isPending ? <Loading variant="inline" message="Загружаем публикацию…" />
        : isEditing && (original.isError || !original.data?.canEdit)
          ? <View style={s.card}>
              <Text style={s.error}>{original.isError ? errorMessage(original.error) : "Редактирование этой публикации недоступно."}</Text>
              <AppBackButton onPress={() => router.back()} />
            </View>
        : <>
        <View style={s.composeEditor}>
          <TextInput value={text} onChangeText={setText} multiline textAlignVertical="top"
            placeholder="Расскажите о своём питомце…" placeholderTextColor={COLORS.textSecondary}
            style={s.composeInput} maxLength={10_000} />
          <Text style={[s.composeCounter, countFeedCharacters(text) > FEED_LIMITS.postCharacters && s.error]}>
            {countFeedCharacters(text)} / {FEED_LIMITS.postCharacters}
          </Text>
        </View>
        {isEditing && existingMediaIds.length > 0 && <View style={s.composeAttachments}>
          <Text style={s.composeAttachmentsTitle}>Вложения публикации · {existingMediaIds.length}</Text>
          <SortableMediaStrip
            items={existingMediaIds.map(id => {
              const asset: FeedMediaDto | undefined = original.data?.attachments.find(item => item.id === id);
              return { id, kind: asset?.kind === "video" ? "video" : "photo", uri: asset?.thumbUrl ?? asset?.posterUrl ?? asset?.fullUrl };
            })}
            onMove={moveExisting}
            onRemove={id => setExistingMediaIds(items => items.filter(value => value !== id))}
            disabled={busy}
          />
          {existingMediaIds.length > 1 && <Text style={s.composeReorderHint}>Удерживайте фотографию и перетаскивайте</Text>}
        </View>}
        <View style={s.composeTools}>
          {([
            ["library", "Галерея"],
            ["camera-photo", "Фото"],
            ["camera-video", "Видео"],
          ] as const).map(([source, label]) => (
            <Pressable key={source} accessibilityRole="button" accessibilityLabel={label}
              disabled={busy} onPress={() => void pick(source)}
              style={({ pressed }) => [s.composeTool, (pressed || busy) && s.composeToolPressed]}>
              <Image source={{ uri: composeToolIconUri[source] }} style={s.composeToolIcon} contentFit="contain" />
              <Text style={s.composeToolText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Фотографии из альбомов"
            accessibilityState={{ expanded: albumsOpen }} disabled={busy}
            onPress={() => setAlbumsOpen(open => !open)}
            style={({ pressed }) => [s.composeTool, albumsOpen && s.composeToolSelected, (pressed || busy) && s.composeToolPressed]}>
            <Image source={{ uri: composeToolIconUri.album }} style={s.composeToolIcon} contentFit="contain" />
            <Text style={s.composeToolText}>Альбомы</Text>
            {albumPhotoIds.length > 0 && <View style={s.composeToolDot} />}
          </Pressable>
        </View>
        {picked.length > 0 && <View style={s.composeAttachments}>
          <Text style={s.composeAttachmentsTitle}>С устройства · {picked.length}</Text>
          <SortableMediaStrip
            items={picked.map(asset => ({ id: asset.requestId, kind: asset.kind, uri: asset.kind === "photo" ? asset.uri : null }))}
            onMove={move}
            onRemove={id => setPicked(items => items.filter(item => item.requestId !== id))}
            disabled={busy}
          />
          {picked.length > 1 && <Text style={s.composeReorderHint}>Удерживайте фотографию и перетаскивайте</Text>}
        </View>}
        {albumPhotoIds.length > 0 && !albumsOpen &&
          <Text style={s.composeAlbumCount}>Из альбомов: {albumPhotoIds.length} фото</Text>}
        {albumsOpen && <FeedAlbumPicker selected={albumPhotoIds} disabled={busy} onChange={ids => {
          if (ids.length + picked.length + existingMediaIds.length > FEED_LIMITS.maxAttachments) {
            Alert.alert("Слишком много вложений", "Максимум 10 вложений."); return;
          }
          setAlbumPhotoIds(ids);
        }} />}
        {!isEditing && status.data?.enabled && <FeedPollComposer value={poll} onChange={setPoll} disabled={busy}
          onPickImage={index => void choosePollImage(index)} onRemoveImage={removePollImage} />}
        {isEditing && original.data?.hasPoll && <Text style={s.composeAlbumCount}>
          Опрос остаётся без изменений. После публикации варианты нельзя редактировать.
        </Text>}
        {progress ? <Text accessibilityRole="alert" style={s.composeAlbumCount}>{progress}</Text> : null}
        <Button label={busy ? (isEditing ? "Сохраняем…" : "Публикуем…") : isEditing ? "Сохранить изменения" : "Опубликовать"} variant="primary"
          height={46} fontSize={15} lineHeight={20} borderRadius={14} animatedPress
          disabled={busy || !canSubmit}
          onPress={() => void submit()} />
      </> : <Status status={status} />}
    </ScrollView>
  </TexturedSafeAreaView>;
}
export function FeedDetailScreen({ id, commentId }: { id: string; commentId?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = useFeedStatus();
  const userId = useAuthStore(state => state.user?.id);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyToName, setReplyToName] = useState("");
  const [busy, setBusy] = useState(false);
  const composerRef = useRef<TextInput>(null);
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
  const startReply = (item: FeedCommentDto) => {
    setReplyTo(item.id);
    setReplyToName(item.author.name);
    composerRef.current?.focus();
  };
  const cancelReply = () => { setReplyTo(null); setReplyToName(""); };
  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await feedApi.createComment(id, { text: body, replyToId: replyTo, clientRequestId: Crypto.randomUUID() });
      setBody(""); cancelReply();
      await client.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) { Alert.alert("Не удалось отправить", errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <TexturedSafeAreaView style={s.screen} edges={["top","left","right"]}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.detailHeader}>
        <AppBackButton onPress={() => router.back()} />
        <Text style={s.detailHeading}>Публикация</Text>
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={s.detailContent}>
        {status.data?.enabled !== true ? <Status status={status} /> : <>
          {post.isPending && <Loading variant="inline" message="Загрузка публикации…" />}
          {post.isError && <Text style={s.error}>{errorMessage(post.error)}</Text>}
          {post.data && <FeedPostCard post={post.data} detailed />}
          {post.data?.canDelete && <GafusReactionProgress postId={post.data.id} />}
          <View style={s.commentsBlock} onLayout={event => {
            focusedY.current = event.nativeEvent.layout.y;
            if (focused.data?.postId === id) scroll.current?.scrollTo({ y: focusedY.current, animated: true });
          }}>
            <Text style={s.commentsHeading}>Комментарии{post.data ? ` · ${post.data.commentCount}` : ""}</Text>
            {commentId && <View accessibilityLabel="Комментарий из уведомления" style={s.focusedComment}>
              {focused.isPending && <Loading variant="inline" message="Загрузка комментария…" />}
              {(focused.isError || (focused.data && focused.data.postId !== id)) && <Muted>Комментарий недоступен.</Muted>}
              {focused.data?.postId === id && <CommentRow item={focused.data} onReply={startReply} />}
            </View>}
            {comments.isPending && <Loading variant="inline" message="Загрузка комментариев…" />}
            {comments.isError && <Text style={s.error}>{errorMessage(comments.error)}</Text>}
            {comments.data?.pages.flatMap(page => page.items)
              .filter(item => item.id !== (focused.data?.postId === id ? commentId : null))
              .map(item => <CommentRow key={item.id} item={item} onReply={startReply} />)}
            {comments.hasNextPage && <Pressable accessibilityRole="button" style={s.moreComments}
              disabled={comments.isFetchingNextPage} onPress={() => void comments.fetchNextPage()}>
              <Text style={s.more}>{comments.isFetchingNextPage ? "Загрузка…" : "Показать ещё комментарии"}</Text>
            </Pressable>}
            {comments.isFetchingNextPage && <MascotSpinner />}
            {!comments.isPending && !comments.isError && !comments.data?.pages.flatMap(page => page.items).length && !focused.data &&
              <Muted>Пока нет комментариев. Напишите первым.</Muted>}
          </View>
        </>}
      </ScrollView>
      {status.data?.enabled === true && <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {replyTo && <View style={s.replyBanner}>
          <MaterialCommunityIcons name="reply" size={16} color={COLORS.primary} />
          <Text numberOfLines={1} style={s.replyBannerText}>Ответ для {replyToName}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Отменить ответ"
            style={s.replyCancel} onPress={cancelReply}>
            <MaterialCommunityIcons name="close" size={18} color={COLORS.textSecondary} />
          </Pressable>
        </View>}
        <View style={s.composerRow}>
          <TextInput ref={composerRef} value={body} onChangeText={setBody}
            multiline textAlignVertical="center" style={s.composerInput}
            accessibilityLabel="Написать комментарий"
            placeholder={replyTo ? "Написать ответ…" : "Комментарий…"}
            placeholderTextColor={COLORS.textSecondary} />
          <Pressable accessibilityRole="button" accessibilityLabel={busy ? "Отправка…" : "Отправить комментарий"}
            accessibilityState={{ disabled: busy || !body.trim() || countFeedCharacters(body) > FEED_LIMITS.commentCharacters }}
            style={[s.composerSend, (busy || !body.trim() || countFeedCharacters(body) > FEED_LIMITS.commentCharacters) && s.composerSendDisabled]}
            disabled={busy || !body.trim() || countFeedCharacters(body) > FEED_LIMITS.commentCharacters}
            onPress={() => void send()}>
            <MaterialCommunityIcons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
        {countFeedCharacters(body) > FEED_LIMITS.commentCharacters &&
          <Text style={s.composerLimit}>Максимум {FEED_LIMITS.commentCharacters} символов</Text>}
      </View>}
    </KeyboardAvoidingView>
  </TexturedSafeAreaView>;
}
function CommentRow({ item, onReply }: { item: FeedCommentDto; onReply: (item: FeedCommentDto) => void }) {
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
  const openActions = () => {
    if (busy || (!item.canEdit && !item.canDelete)) return;
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (item.canEdit) options.push({ text: "Изменить", onPress: () => { setDraft(item.text); setEditing(true); } });
    if (item.canDelete) options.push({ text: "Удалить", style: "destructive", onPress: () =>
      Alert.alert("Удалить комментарий?", "Отменить удаление будет нельзя.", [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: () => void run("delete") },
      ]) });
    options.push({ text: "Отмена", style: "cancel" });
    Alert.alert("Комментарий", undefined, options);
  };
  const goProfile = () => router.push({
    pathname: "/profile/[username]", params: { username: item.author.username },
  } as Href);
  return <View style={s.comment}>
    <View style={s.commentLine}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Профиль ${item.author.name}`}
        style={s.commentAvatarTap} onPress={goProfile}>
        {item.author.avatarUrl
          ? <Image source={{ uri: item.author.avatarUrl }} style={s.commentAvatar} cachePolicy="memory" />
          : <View style={[s.commentAvatar, s.avatarFallback]}>
              <Text style={s.commentAvatarInitial}>{item.author.name.slice(0, 1)}</Text>
            </View>}
      </Pressable>
      <View style={s.commentContent}>
        <View style={s.commentMetaRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Профиль ${item.author.name}`}
            style={s.commentAuthorTap} onPress={goProfile}>
            <Text numberOfLines={1} style={s.commentAuthorName}>{item.author.name}</Text>
          </Pressable>
          <Text numberOfLines={1} style={s.commentTime}>
            {formatFeedTime(item.createdAt)}{item.editedAt ? " · изм." : ""}
          </Text>
          {(item.canEdit || item.canDelete) && !item.deleted &&
            <Pressable accessibilityRole="button" accessibilityLabel="Действия с комментарием"
              style={s.commentMenuButton} disabled={busy} onPress={openActions}>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={COLORS.textSecondary} />
            </Pressable>}
        </View>
        {item.replyToName && <Text numberOfLines={1} style={s.commentReplyLabel}>↪ {item.replyToName}</Text>}
        {editing
          ? <View style={s.inlineEditor}>
              <TextInput style={s.inlineEditInput} multiline value={draft} onChangeText={setDraft}
                placeholder="Изменить комментарий" placeholderTextColor={COLORS.textSecondary} />
              <View style={s.inlineEditActions}>
                <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={s.commentAction}>
                  <Text style={s.commentActionText}>Отмена</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  disabled={busy || !draft.trim() || countFeedCharacters(draft) > FEED_LIMITS.commentCharacters}
                  onPress={() => void run("edit")} style={s.commentAction}>
                  <Text style={s.commentActionText}>Сохранить</Text>
                </Pressable>
              </View>
            </View>
          : <Pressable onLongPress={openActions} disabled={!item.canEdit && !item.canDelete}>
              <Text style={[s.commentBody, item.deleted && s.deletedComment]}>
                {item.deleted ? "Комментарий удалён" : item.text}
              </Text>
            </Pressable>}
        {!item.deleted && !item.canEdit && <FeedReportButton type="comment" id={item.id} authorId={item.author.id} />}
        {!item.deleted && !editing && <View style={s.commentActions}>
          <FeedReactionStrip reactions={item.reactions} myReaction={item.myReaction}
            busy={busy} onSelect={async emoji => { await run("reaction", emoji); }} />
          <Pressable accessibilityRole="button" style={s.commentReplyButton}
            onPress={() => onReply(item)}>
            <Text style={s.commentActionText}>Ответить</Text>
          </Pressable>
        </View>}
        {!item.rootId && item.replyCount > 0 && <Pressable accessibilityRole="button"
          style={s.showRepliesButton} onPress={() => setShowReplies(previous => !previous)}>
          <MaterialCommunityIcons name={showReplies ? "chevron-up" : "reply-outline"}
            size={17} color={COLORS.primary} />
          <Text style={s.more}>{showReplies ? "Скрыть ответы" : `Ответы · ${item.replyCount}`}</Text>
        </Pressable>}
      </View>
    </View>
    {showReplies && <View style={s.threadReplies}>
      {replies.isPending && <Loading variant="inline" message="Загружаем ответы…" />}
      {replies.isError && <Pressable accessibilityRole="button"
        onPress={() => void replies.refetch()} style={s.moreComments}>
        <Text style={s.more}>Повторить загрузку ответов</Text>
      </Pressable>}
      {replies.data?.pages.flatMap(page => page.items).map(reply =>
        <CommentRow key={reply.id} item={reply} onReply={onReply} />)}
      {replies.hasNextPage && <Pressable accessibilityRole="button"
        style={s.moreComments} disabled={replies.isFetchingNextPage}
        onPress={() => void replies.fetchNextPage()}>
        <Text style={s.more}>{replies.isFetchingNextPage ? "Загрузка…" : "Ещё ответы"}</Text>
      </Pressable>}
      {replies.isFetchingNextPage && <MascotSpinner />}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1 }, padding: { padding: SPACING.md, paddingBottom: 100, gap: SPACING.md },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  videoPlayCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(22,31,17,0.78)", alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 8, paddingBottom: 80 }, listItem: { marginBottom: 7 },
  momentsHeaderArtwork: { height: 180, marginHorizontal: -8, marginBottom: SPACING.sm },
  momentsHeaderImage: { width: "100%", height: "100%" },
  pageHeader: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12, minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pageHeaderCompact: { paddingHorizontal: 10, gap: 6 },
  heading: { color: COLORS.text, fontFamily: FONTS.montserratMedium, fontSize: 21 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  headerActionsCompact: { gap: 6 },
  bookmarksButton: { width: 134, height: 44, position: "relative" },
  bookmarksButtonCompact: { width: 112 },
  bookmarksButtonBackground: { width: "100%", height: 44 },
  bookmarksContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
  },
  bookmarksIcon: { width: 24, height: 24, flexShrink: 0 },
  bookmarksIconCompact: { width: 20, height: 20 },
  bookmarksText: { color: "#503C27", fontFamily: FONTS.montserratBold, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  bookmarksTextCompact: { fontSize: 11 },
  newPostButton: { width: 44, height: 44, position: "relative" },
  newPostButtonCompact: { width: 42 },
  newPostButtonBackground: { width: "100%", height: 44 },
  newPostIcon: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: COLORS.cardBackground, borderRadius: 20, padding: 16, gap: 12 },
  publicationQueue: { gap: 10, marginHorizontal: 8, marginBottom: 12 },
  publicationCard: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12,
    borderRadius: 16, backgroundColor: COLORS.cardBackground },
  publicationMedia: { width: 88, height: 88, borderRadius: 12, backgroundColor: COLORS.cardBackground,
    alignItems: "center", justifyContent: "center", overflow: "hidden" },
  publicationPreview: { ...StyleSheet.absoluteFillObject, opacity: 0.48 },
  publicationBody: { flex: 1, minWidth: 0, gap: 7 },
  publicationTitle: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.primary },
  publicationExcerpt: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  publicationActions: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  publicationDismiss: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  postCard: { backgroundColor: COLORS.cardBackground, borderRadius: 14, padding: 10, gap: 7 },
  postCardDetailed: { padding: 12, gap: 9, borderRadius: 16 },
  postAuthorBar: { flexDirection: "row", alignItems: "center", gap: 5 },
  authorRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 35 },
  postMenuButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  avatar: { height: 34, width: 34, borderRadius: 17 },
  avatarFallback: { backgroundColor: "#e5e5cf", justifyContent: "center", alignItems: "center" },
  avatarInitial: { fontFamily: FONTS.montserratBold, color: COLORS.primary, fontSize: 15 },
  authorInfo: { flex: 1, minWidth: 0, gap: 3 },
  authorIdentity: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  authorName: { color: COLORS.text, fontFamily: FONTS.montserratMedium, fontSize: 13, flexShrink: 1 },
  authorRoleBadge: { flexShrink: 0, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6 },
  authorRoleAdmin: { backgroundColor: "#F4E3CD" },
  authorRoleTrainer: { backgroundColor: "#E4EBD6" },
  authorRoleText: { fontFamily: FONTS.montserratMedium, fontSize: 10 },
  authorRoleTextAdmin: { color: "#885327" },
  authorRoleTextTrainer: { color: "#4E6337" },
  text: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 15 },
  muted: { fontFamily: FONTS.montserrat, color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  body: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 14, lineHeight: 20 },
  bodyDetailed: { fontSize: 15, lineHeight: 24 },
  expandText: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center", paddingRight: 18 },
  more: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, justifyContent: "space-between", flexWrap: "wrap" },
  postFooter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 8, rowGap: 2 },
  postStats: { flexDirection: "row", alignItems: "center", gap: 10 },
  postStat: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 4 },
  postStatText: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  compactReactions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  reactionPill: { minHeight: 30, borderRadius: 15, backgroundColor: "#f1ecdf", paddingHorizontal: 7, flexDirection: "row", alignItems: "center", gap: 4 },
  reactionPillSelected: { backgroundColor: "#dce6c9" },
  reactionEmoji: { fontSize: 16, lineHeight: 23 },
  reactionCount: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  addReaction: { width: 34, height: 32, alignItems: "center", justifyContent: "center" },
  reactionModal: { flex: 1 },
  reactionPalette: {
    position: "absolute", flexDirection: "row", alignItems: "center", gap: 3,
    padding: 8, height: 58, borderRadius: 20, backgroundColor: "#faf7ef",
    shadowColor: "#000", shadowOpacity: 0.16, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12, elevation: 6,
  },
  reactionPaletteItem: { flex: 1, minWidth: 0, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  reactionPaletteEmoji: { fontSize: 23 },
  feedCarousel: { marginHorizontal: -10, borderRadius: 8 },
  carousel: { gap: 8 }, media: { width: 295, height: 226, borderRadius: 8, overflow: "hidden" },
  image: { width: "100%", height: "100%" }, videoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 12, minHeight: 120, padding: 12, fontFamily: FONTS.montserrat, fontSize: 15, color: COLORS.text, backgroundColor: "#FFFEF9" },
  composeContent: { paddingHorizontal: SPACING.md, paddingTop: 6, paddingBottom: 44, gap: 12 },
  composeTopBar: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: SPACING.md, paddingBottom: 10, gap: 12 },
  composeBackPill: { minHeight: 44, flexDirection: "row", alignItems: "center", paddingLeft: 9, paddingRight: 15, borderRadius: 24, backgroundColor: "#FBF7EF" },
  composeBackLabel: { fontFamily: FONTS.montserratMedium, fontSize: 16, color: COLORS.text },
  composeTopTitle: { flex: 1, fontFamily: FONTS.montserratMedium, fontSize: 17, color: COLORS.text },
  composeEditor: { backgroundColor: COLORS.cardBackground, padding: 12, borderRadius: 16, gap: 4 },
  composeInput: { minHeight: 106, padding: 0, fontFamily: FONTS.montserrat, fontSize: 15, lineHeight: 23, color: COLORS.text, textAlignVertical: "top" },
  composeCounter: { textAlign: "right", fontFamily: FONTS.montserrat, fontSize: 11, color: COLORS.textSecondary },
  composeTools: { flexDirection: "row", gap: 7 },
  composeTool: { flex: 1, minWidth: 0, height: 58, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: COLORS.cardBackground },
  composeToolIcon: { width: 36, height: 36 },
  composeToolPressed: { opacity: 0.6 },
  composeToolSelected: { backgroundColor: "#DFE7D0" },
  composeToolText: { fontFamily: FONTS.montserratMedium, fontSize: 11, color: COLORS.primary },
  composeToolDot: { position: "absolute", right: 8, top: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  composeAttachments: { gap: 6 },
  composeAttachmentsTitle: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.textSecondary },
  composeReorderHint: { fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16, color: COLORS.textSecondary },
  composeAlbumCount: { fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  error: { color: "#95283B", fontFamily: FONTS.montserrat },
  detailHeader: { height: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  detailBack: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
  detailHeading: { fontFamily: FONTS.montserratMedium, color: COLORS.text, fontSize: 17 },
  detailContent: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 18, gap: 10 },
  commentsBlock: { backgroundColor: COLORS.cardBackground, borderRadius: 16, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  commentsHeading: { fontFamily: FONTS.montserratMedium, fontSize: 17, lineHeight: 23, color: COLORS.text, paddingBottom: 7 },
  focusedComment: { backgroundColor: "#e7eadb", borderRadius: 12, paddingHorizontal: 8 },
  comment: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight, paddingVertical: 9, gap: 5 },
  commentLine: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  commentAvatarTap: { width: 32, height: 32 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarInitial: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 13 },
  commentContent: { flex: 1, minWidth: 0, gap: 4 },
  commentMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 23 },
  commentAuthorTap: { flexShrink: 1, minWidth: 0 },
  commentAuthorName: { fontFamily: FONTS.montserratMedium, fontSize: 13, lineHeight: 18, color: COLORS.text },
  commentTime: { flexShrink: 1, fontFamily: FONTS.montserrat, fontSize: 11, color: COLORS.textSecondary },
  commentMenuButton: { marginLeft: "auto", width: 28, height: 30, alignItems: "center", justifyContent: "center" },
  commentReplyLabel: { fontFamily: FONTS.montserrat, fontSize: 11, color: COLORS.textSecondary },
  commentBody: { fontFamily: FONTS.montserrat, fontSize: 14, lineHeight: 20, color: COLORS.text },
  deletedComment: { color: COLORS.textSecondary, fontStyle: "italic" },
  commentActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", gap: 4 },
  commentReplyButton: { minHeight: 32, paddingHorizontal: 6, justifyContent: "center" },
  commentAction: { minHeight: 36, paddingHorizontal: 6, justifyContent: "center" },
  commentActionText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  showRepliesButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  threadReplies: { marginLeft: 40, borderLeftWidth: 1, borderLeftColor: "#ccd5b8", paddingLeft: 10 },
  inlineEditor: { gap: 5 },
  inlineEditInput: { minHeight: 56, maxHeight: 110, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: "#fffef9", padding: 8, fontFamily: FONTS.montserrat, fontSize: 13, color: COLORS.text },
  inlineEditActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12 },
  moreComments: { minHeight: 38, justifyContent: "center", alignItems: "center" },
  composer: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: "#faf7ef", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderLight, gap: 6 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 110, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 21, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: "#fffef9", fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.text },
  composerSend: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  composerSendDisabled: { opacity: 0.45 },
  composerLimit: { color: "#95283B", fontFamily: FONTS.montserrat, fontSize: 11 },
  replyBanner: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 5 },
  replyBannerText: { flex: 1, fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.textSecondary },
  replyCancel: { width: 30, height: 30, justifyContent: "center", alignItems: "center" },
});

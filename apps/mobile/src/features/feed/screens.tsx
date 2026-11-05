import { FeedReportButton } from "./FeedPostActions";
import { FeedPostOwnerActions } from "./FeedPostOwnerActions";
import { publicationPhaseLabel, type PublicationItem } from "@gafus/core-client/feed/publication-client";
import { mobileFeedPublications } from "./publication";
import { videoRetryMessage, videoServerFailureMessage } from "@/shared/lib/media/videoRetryMessage";
import { photoRetryMessage } from "@/shared/lib/media/photoRetryMessage";
import { mobilePendingRefreshInterval } from "./pendingRefresh";
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
  getFeedAuthorRoleBadge, getFeedUploadedFilesPercent,
  type FeedPostDto, type FeedCommentDto, type FeedReaction, type FeedReactionCountDto, type FeedMediaDto, type FeedSort, type FeedImpressionInput,
} from "@gafus/types";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { Button } from "@/shared/components";
import { feedApi, feedEditCommentGuarded, feedDeleteCommentGuarded, feedCommentReactionGuarded, feedPostReactionGuarded, feedCreateCommentGuarded, feedSaveRevisionGuarded, feedPublishPostGuarded } from "@/shared/lib/api/feed";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { pickFeedMedia, pickFeedPollOptionPhoto, uploadPickedFeedMedia, checkFeedPickedMedia, releaseFeedPickedMedia, type FeedPickedMedia } from "./uploads";
import { FeedVideo, stopFeedVideoOutsidePosts } from "./FeedVideo";
import { mobileFeedTelemetry } from "./telemetry";
import { FeedMediaViewer, FeedCommentAttachments } from "./FeedMediaViewer";
import { getFeedPreviewHeight } from "./feedMediaLayout";
import { feedV2PreviewHeight } from "./feedV2PreviewHeight";

import { GafusReactionProgress } from "./GafusReactionProgress";
import { FeedAlbumPicker } from "./FeedAlbumPicker";
import { FeedCarouselDots } from "./FeedCarouselDots";
import { FeedPublicationProgress } from "./FeedPublicationProgress";
import { FeedDraftDeleteButton } from "./FeedDraftDeleteButton";
import { getFeedPublicationPercent } from "./publicationProgressState";
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

type PostReactionActor = { ownerId: string; epoch: string };

/** Post ID and verified native principal key the mutation lifetime, not the visible card. */
function FeedPostReactionActions({ post }: { post: FeedPostDto }) {
  const userId = useAuthStore(state =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor: PostReactionActor | null =
    userId && binding?.principalId === userId && binding.authEpoch
      ? { ownerId: userId, epoch: binding.authEpoch }
      : null;
  return <ActorPostReactionActions
    key={`${actor?.ownerId ?? "guest"}:${actor?.epoch ?? "unverified"}:${post.id}`}
    actor={actor} post={post} />;
}

function ActorPostReactionActions({
  post, actor,
}: { post: FeedPostDto; actor: PostReactionActor | null }) {
  const cache = useQueryClient();
  const mounted = useRef(true);
  const flight = useRef(false);
  const unknown = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmedReaction, setConfirmedReaction] =
    useState<FeedReaction | null | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const currentActor = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const react = async (reaction: FeedReaction) => {
    if (flight.current || unknown.current || !currentActor()) return;
    const previous = confirmedReaction !== undefined ? confirmedReaction : post.myReaction;
    const next = previous === reaction ? null : reaction;
    flight.current = true;
    setBusy(true);
    try {
      const ack = await feedPostReactionGuarded(post.id, next, currentActor);
      if (!currentActor()) return;
      if (!ack || ack.id !== post.id || ack.status === "deleted" ||
          ack.myReaction !== next)
        throw new Error("FEED_POST_REACTION_ACK_MISMATCH");
      setConfirmedReaction(next);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch {
        reportClientError(new Error("FEED_POST_REACTION_CACHE_FAILURE"), {
          issueKey: "FeedPostReaction", keys: { operation: "reaction_cache" },
        });
      }
    } catch {
      if (!currentActor()) return;
      unknown.current = true;
      reportClientError(new Error("FEED_POST_REACTION_RESULT_UNCONFIRMED"), {
        issueKey: "FeedPostReaction", keys: { operation: "post_reaction" },
      });
      Alert.alert("Моменты", "Результат реакции неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      flight.current = false;
      if (currentActor()) setBusy(false);
    }
  };
  return <FeedReactionStrip
    reactions={post.reactions}
    myReaction={confirmedReaction !== undefined ? confirmedReaction : post.myReaction}
    busy={busy || unknown.current || !currentActor()}
    onSelect={react} />;
}
export function FeedPostCard({ post, detailed = false }: { post: FeedPostDto; detailed?: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [mediaPosition, setMediaPosition] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaWidth, setMediaWidth] = useState(320);
  const { height: viewportHeight } = useWindowDimensions();
  useEffect(() => { setMediaPosition(0); setViewerIndex(null); }, [post.id]);
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
  const mediaHeight = firstMedia?.kind === "video"
    ? feedV2PreviewHeight({
        width: firstMedia.width ?? 1280, height: firstMedia.height ?? 720,
      }, mediaWidth, viewportHeight)
    : getFeedPreviewHeight(
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
    <FeedPostOwnerActions post={post} detailed={detailed} />
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
        {asset.kind === "video" && (asset.mp4Urls?.[360] || asset.mp4Urls?.[720]) ? (
          <FeedVideo postId={post.id} mediaId={asset.id} poster={asset.posterUrl ?? null}
            mp4Urls={asset.mp4Urls} width={asset.width ?? undefined}
            height={asset.height ?? undefined} visible />
        ) : (
          <Pressable style={s.image} onPress={event => {
            event.stopPropagation();
            setViewerIndex(index);
          }}
            accessibilityRole="button"
            accessibilityLabel={asset.kind === "photo"
              ? "Открыть фото " + (index + 1) + " на весь экран"
              : "Открыть видео " + (index + 1) + " на весь экран"}>
            {asset.kind === "photo" && (asset.fullUrl || asset.thumbUrl) ? (
              <CdnImage cdnUrl={asset.fullUrl ?? asset.thumbUrl ?? ""}
                requestFallback={() => feedApi.requestMediaFallback(asset.id, asset.fullUrl ? "full" : "thumb")}
                contentFit="contain" style={s.image} />
            ) : (
              <>
                {!!asset.posterUrl && <CdnImage cdnUrl={asset.posterUrl}
                  requestFallback={() => feedApi.requestMediaFallback(asset.id, "poster")}
                  contentFit="contain" style={s.image} />}
                <View style={s.videoPlayOverlay} pointerEvents="none">
                  <View style={s.videoPlayCircle}>
                    <MaterialCommunityIcons name="play" size={32} color="#FFF8EB" />
                  </View>
                </View>
              </>
            )}
          </Pressable>
        )}
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
      <FeedPostReactionActions post={post} />
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
function RecoveredDraftExcerpt({ post, ownerId }: {
  post: FeedPostDto; ownerId?: string;
}) {
  const details = useQuery({
    queryKey: ["feed", "recovered-draft", ownerId, post.id],
    queryFn: () => feedApi.getEditor(post.id),
    enabled: !!ownerId && post.author?.id === ownerId && post.status !== "pending" && !post.text,
    staleTime: 30_000,
  });
  const recoveredText = details.data?.id === post.id && details.data.author.id === ownerId
    ? details.data.pendingRevision?.text : undefined;
  const text = post.text || recoveredText;
  return <Text style={s.publicationExcerpt} numberOfLines={2}>
    {text || "Не все вложения были загружены. Добавьте файл заново или удалите черновик."}
  </Text>;
}

export function FeedPublicationQueue({ ownerId }: { ownerId?: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const previousPending = useRef<{ ownerId: string; ids: Set<string> } | null>(null);
  const local = useSyncExternalStore(mobileFeedPublications.subscribe,
    mobileFeedPublications.getSnapshot, () => EMPTY_PUBLICATIONS)
    .filter(item => item.ownerId === ownerId);
  const pending = useQuery({
    queryKey: ["feed", "pending", ownerId],
    queryFn: () => feedApi.listPendingPosts(),
    enabled: !!ownerId,
    refetchInterval: query => mobilePendingRefreshInterval(query.state.data?.items),
  });
  useEffect(() => {
    // Only a fresh, successful owner-scoped server snapshot can tell us that
    // an accepted post has left the processing queue. The feed GET itself
    // remains authoritative for publication/visibility.
    if (!ownerId || !pending.isSuccess || pending.isFetching || !pending.data) return;
    const ids = new Set(pending.data.items
      .filter(post => post.status === "pending").map(post => post.id));
    const previous = previousPending.current;
    previousPending.current = { ownerId, ids };
    if (!previous || previous.ownerId !== ownerId ||
      ![...previous.ids].some(id => !ids.has(id))) return;
    void cache.invalidateQueries({ queryKey: ["feed", "posts", ownerId] });
  }, [cache, ownerId, pending.isSuccess, pending.isFetching, pending.dataUpdatedAt]);
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
        {item.phase === "uploading" &&
          getFeedPublicationPercent("uploading", item.progress) !== null &&
          <Text style={s.publicationProgressLabel}>
            Загрузка: {Math.round(getFeedPublicationPercent("uploading", item.progress) ?? 0)}%
          </Text>}
        {(item.phase === "uploading" || item.phase === "processing") && (
          <FeedPublicationProgress phase={item.phase} progress={item.progress} />
        )}
        {item.files?.map(file => <View key={file.requestId} style={{
          flexDirection: "row", gap: 10, alignItems: "center", marginTop: 9,
          padding: 8, backgroundColor: "#eef0e8", borderRadius: 12,
        }}>
          <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: "#17211d",
            alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {file.previewUri ? <Image source={{ uri: file.previewUri }}
              style={{ width: 64, height: 64 }} contentFit="cover" /> :
              <MaterialCommunityIcons name={file.kind === "video" ? "video-outline" : "image-outline"}
                size={26} color="#fff" />}
            {(file.kind === "video" || file.kind === "photo") && file.phase === "failed" &&
              <Pressable accessibilityRole="button"
                accessibilityLabel={`Повторить обработку ${file.kind === "photo" ? "фото" : "видео"} ${file.name ?? ""}`}
                onPress={() => mobileFeedPublications.retryFile(item.id, file.requestId)}
                style={{ position: "absolute", width: 50, height: 50, borderRadius: 25,
                  backgroundColor: "#17211de9", borderColor: "#fffb", borderWidth: 1,
                  alignItems: "center", justifyContent: "center" }}>
                <MaterialCommunityIcons name="refresh" size={29} color="#fff" />
              </Pressable>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: "#283f2b" }}>
              {file.name ?? (file.kind === "video" ? "Видео" : "Фото")}</Text>
            <Text style={{ fontSize: 12, color: file.phase === "failed" ? "#a23f27" : "#4b5947" }}>
              {file.phase === "failed" ? "Не удалось обработать или отправить" :
                file.phase === "ready" ? "Передано" :
                file.phase === "uploading" ? "Подготовка и отправка…" : "Ожидает отправки"}
            </Text>
            {file.phase === "failed" && <Text accessibilityRole="alert" style={{
              fontSize: 12, color: "#83301e", lineHeight: 17, marginTop: 3 }}>
              {file.kind === "video" ? videoRetryMessage(file.error) : photoRetryMessage(file.error)}
            </Text>}
          </View>
        </View>)}
        {item.phase === "failed" && !item.files?.some(file => file.phase === "failed") &&
          <Text accessibilityRole="alert" style={s.error}>
            {item.files?.some(file => file.kind === "video") ? videoServerFailureMessage :
              "Не удалось завершить обработку вложений. Проверьте состояние черновика."}
            {" "}Откройте черновик для исправления.
          </Text>}
        {item.phase === "failed" && <View style={s.publicationActions}>
          {item.files?.some(file => file.phase === "failed") ?
            <Text style={s.publicationExcerpt}>
              Нажмите круглую стрелку на неудавшемся файле. Уже переданные вложения повторно не отправятся.
            </Text> : item.files?.some(file => file.phase === "waiting") ?
            <Pressable accessibilityRole="button" accessibilityLabel="Продолжить оставшиеся вложения"
              onPress={() => mobileFeedPublications.retry(item.id)}>
              <Text style={s.publicationLink}>Продолжить оставшиеся вложения</Text>
            </Pressable> :
            !!item.postId && <Pressable accessibilityRole="button"
              accessibilityLabel="Открыть черновик для исправления"
              onPress={() => router.push({ pathname: "/(main)/feed/create",
                params: { edit: item.postId! } } as Href)}>
              <Text style={s.publicationLink}>Открыть черновик</Text>
            </Pressable>}
          <FeedDraftDeleteButton ownerId={item.ownerId} postId={item.postId}
            onDeleted={() => mobileFeedPublications.dismiss(item.id)} />
        </View>}
      </View>
    </View>)}
    {recovered.map(post => {
      const uploadedPercent = getFeedUploadedFilesPercent(post.attachments);
      return <View key={post.id} style={s.publicationCard}>
      <MaterialCommunityIcons name={post.status === "pending" ? "clock-outline" : "file-document-edit-outline"}
        size={26} color={COLORS.primary} />
      <View style={s.publicationBody}>
        <Text style={s.publicationTitle}>{post.status === "pending"
          ? "Обрабатываем публикацию…" : post.status === "failed"
            ? "Ошибка обработки" : "Черновик публикации"}</Text>
        {post.status === "failed" && <Text accessibilityRole="alert" style={s.error}>
          {post.attachments.some(media => media.kind === "video") ? videoServerFailureMessage :
            "Сервер не завершил обработку вложений. Откройте черновик для исправления."}
        </Text>}
        {post.status !== "pending" ? <RecoveredDraftExcerpt post={post} ownerId={ownerId} />
          : !!post.text && <Text style={s.publicationExcerpt} numberOfLines={2}>{post.text}</Text>}
        {uploadedPercent !== null && post.status !== "failed" && <>
          <Text style={s.publicationProgressLabel}>Файлы загружены: {uploadedPercent}%</Text>
          <FeedPublicationProgress phase="uploading" progress={uploadedPercent} />
          {post.status === "pending" && <Text style={s.publicationExcerpt}>
            Обработка продолжается. Если видео долго не готово, сервис может быть недоступен.
            Сохраните исходник: повторная проверка не перезапускает обработку.
          </Text>}
        </>}
        {post.status === "pending" && uploadedPercent === null &&
          <FeedPublicationProgress phase="processing" />}
        {post.status !== "pending" && <View style={s.publicationActions}>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Продолжить незавершённую публикацию"
            onPress={() => router.push({ pathname: "/(main)/feed/create", params: { edit: post.id } } as Href)}>
            <Text style={s.publicationLink}>Продолжить редактирование</Text>
          </Pressable>
          {post.author?.id === ownerId && <FeedDraftDeleteButton
            ownerId={post.author.id} postId={post.id}
            onDeleted={() => undefined} />}
        </View>}
      </View>
    </View>;
    })}
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
  const pageFlight = useRef<{ ownerId: string | undefined; sort: FeedSort } | null>(null);
  const nextFeedPage = (explicitRetry = false) => {
    if (!pages.hasNextPage || pages.isFetchingNextPage ||
      (pages.isError && !pages.isFetchNextPageError) ||
      (pages.isFetchNextPageError && !explicitRetry) ||
      (pageFlight.current !== null && pageFlight.current.ownerId === userId &&
        pageFlight.current.sort === sort)) return;
    const flight = { ownerId: userId, sort };
    pageFlight.current = flight;
    const release = () => { if (pageFlight.current === flight) pageFlight.current = null; };
    void pages.fetchNextPage().then(release, release);
  };
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
        onEndReached={() => nextFeedPage()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={pages.isFetchingNextPage
          ? <MascotSpinner />
          : pages.isFetchNextPageError
            ? <View style={s.card}>
                <Text accessibilityRole="alert" style={s.error}>
                  Не удалось загрузить следующую страницу. Уже загруженные публикации доступны.
                </Text>
                <Button label="Повторить страницу Моментов"
                  accessibilityLabel="Повторить страницу Моментов"
                  onPress={() => nextFeedPage(true)} />
              </View>
            : null}
        ListEmptyComponent={pages.isPending
          ? <Loading variant="inline" message="Загрузка публикаций…" />
          : pages.isError && !pages.isFetchNextPageError
            ? <View style={s.card}>
                <Muted>{errorMessage(pages.error)}</Muted>
                <Button label="Повторить загрузку Моментов"
                  onPress={() => void pages.refetch()} />
              </View>
            : publishing ? null
            : <View style={s.card}><Muted>Здесь пока нет публикаций.</Muted></View>}
      />}
    <FeedSmartPreferences visible={smartSettingsOpen} onClose={() => setSmartSettingsOpen(false)} />
  </TexturedSafeAreaView>;
}
type FeedEditorActor = { ownerId:string; epoch:string; editId:string };

/** Key edit-only composer lifetime to verified native actor+epoch; new-post queue unchanged. */
export function FeedComposeScreen() {
  const {edit}=useLocalSearchParams<{edit?:string|string[]}>();
  const editId=typeof edit==="string" && /^[A-Za-z0-9_-]{1,128}$/.test(edit)?edit:undefined;
  const ownerId=useAuthStore(state=>state.isAuthenticated && !state.isLoading?state.user?.id:null);
  const binding=newOnlyV2NativeQueues.getVerifiedBinding();
  const actor:FeedEditorActor|null=editId && ownerId &&
    binding?.principalId===ownerId && binding.authEpoch
    ? {ownerId,epoch:binding.authEpoch,editId}:null;
  return <ActorFeedComposeScreen
    key={editId ? `${editId}:${actor?.ownerId??"guest"}:${actor?.epoch??"unverified"}` : "new-post"}
    editActor={actor} />;
}

function ActorFeedComposeScreen({editActor}:{editActor:FeedEditorActor|null}) {
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
  // Historical links into an already accepted, processing publication should
  // return to the feed's existing progress widget, not reopen a dead editor.
  // Published posts stay editable through their explicit edit action.
  useEffect(() => {
    if (!editId || !editActor || !original.data ||
        original.data.id !== editId || original.data.author.id !== editActor.ownerId ||
        original.data.status !== "pending") return;
    router.replace("/(main)/(tabs)/feed" as Href);
  }, [editId, editActor?.ownerId, original.data?.id, original.data?.author.id,
    original.data?.status, router.replace]);
  const [text, setText] = useState("");
  const [poll, setPoll] = useState<MobileFeedPollDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const editMounted=useRef(true);
  const editFlight=useRef(false);
  const editUnknown=useRef(false);
  const editAcknowledged=useRef(false);
  useEffect(()=>{
    editMounted.current=true;
    return ()=>{editMounted.current=false;};
  },[]);
  const currentEditActor=()=>{
    const state=useAuthStore.getState();
    const binding=newOnlyV2NativeQueues.getVerifiedBinding();
    return editMounted.current && isEditing && editId !== undefined && editActor !== null &&
      editActor.editId===editId && state.isAuthenticated && !state.isLoading &&
      state.user?.id===editActor.ownerId &&
      binding?.principalId===editActor.ownerId && binding.authEpoch===editActor.epoch &&
      original.data?.id===editId && original.data?.author.id===editActor.ownerId &&
      original.data?.canEdit===true;
  };
  const [progress, setProgress] = useState("");
  const [picked, setPicked] = useState<FeedPickedMedia[]>([]);
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([]);
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const [existingMediaIds, setExistingMediaIds] = useState<string[]>([]);
  const hydratedEditor = useRef<string | null>(null);
  const copied = useRef(new Map<string, { requestId: string; mediaId?: string }>());
  const draft = useRef<string | null>(null);
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
    let assets: FeedPickedMedia[] = [];
    try {
      assets = await pickFeedMedia(source);
      const next = [...picked, ...assets];
      checkFeedPickedMedia(next);
      if (next.length + albumPhotoIds.length + existingMediaIds.length > FEED_LIMITS.maxAttachments) {
        throw new Error("Максимум 10 вложений.");
      }
      if (existingVideoCount + next.filter(item => item.kind === "video").length > FEED_LIMITS.maxVideos) {
        throw new Error("Максимум три видео.");
      }
      setPicked(next);
      assets = []; // Ownership moved into composer state (or the background publication manager).
    } catch (error) {
      for (const asset of assets) releaseFeedPickedMedia(asset);
      Alert.alert("Не удалось выбрать файл", errorMessage(error));
    }
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
      setPoll(current => {
        if (!current) { releaseFeedPickedMedia(photo); return current; }
        const previous = current.options[index]?.imageAsset;
        if (previous) releaseFeedPickedMedia(previous);
        return { ...current, options: current.options.map((option, i) =>
          i === index ? { ...option, imageAsset: photo } : option) };
      });
    } catch (error) { Alert.alert("Не удалось выбрать фото", errorMessage(error)); }
  };
  const removePollImage = (index: number) => {
    setPoll(current => {
      if (!current) return current;
      const previous = current.options[index]?.imageAsset;
      if (previous) releaseFeedPickedMedia(previous);
      return { ...current, options: current.options.map((option, i) =>
        i === index ? { ...option, imageAsset: undefined } : option) };
    });
  };
  const submit = async () => {
    if (!canSubmit || busy || (isEditing && original.isPending) ||
        (isEditing && (!currentEditActor() || editFlight.current ||
          editUnknown.current || editAcknowledged.current))) return;
    if (poll) {
      const issue = validateFeedPollDraft(poll);
      if (issue) { Alert.alert("Проверьте опрос", issue); return; }
      const count = poll.options.filter(option => option.imageAsset).length;
      if (count + picked.length + existingMediaIds.length + albumPhotoIds.length > FEED_LIMITS.maxAttachments) {
        Alert.alert("Слишком много фото", "Всего можно добавить максимум 10 вложений, включая варианты опроса.");
        return;
      }
    }
    if (isEditing) editFlight.current=true;
    setBusy(true);
    if (!isEditing) {
      try {
        mobileFeedPublications.enqueue({
          ownerId: userId!, text,
          files: picked.map(asset => ({
            ...asset, previewUri: asset.previewUri ?? (asset.kind === "photo" ? asset.uri : undefined),
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
      // New posts already return through the existing offline enqueue branch above.
      // Never create another post when editing an existing post.
      if (!currentEditActor() || !editId || draft.current !== editId) return;
      const created = await feedApi.getEditor(editId);
      if (!currentEditActor()) return;
      if (created.id !== editId || created.author.id !== editActor?.ownerId ||
          !created.canEdit || !Number.isSafeInteger(created.version) || created.version < 1)
        throw new Error("FEED_EDIT_EDITOR_IDENTITY_UNCONFIRMED");
      const attachmentIds: string[] = [...existingMediaIds];
      for (const [index, asset] of picked.entries()) {
        if (!currentEditActor()) return;
        setProgress(`Загружаем ${index + 1} из ${picked.length}…`);
        let id = completed.current.get(asset.requestId);
        if (!id) {
          id = await uploadPickedFeedMedia(created.id, asset);
          if (!currentEditActor()) return;
          completed.current.set(asset.requestId, id);
        }
        attachmentIds.push(id);
      }
      for (const photoId of albumPhotoIds) {
        if (!currentEditActor()) return;
        setProgress("Копируем фотографию из альбома…");
        const previous = copied.current.get(photoId) ?? { requestId: Crypto.randomUUID() };
        copied.current.set(photoId, previous);
        if (!previous.mediaId) {
          const result = await feedApi.copyAlbumPhoto(created.id, {
            photoId, clientRequestId: previous.requestId,
          });
          if (!currentEditActor()) return;
          previous.mediaId = result.id;
        }
        attachmentIds.push(previous.mediaId);
      }
      if (!currentEditActor()) return;
      setProgress("Сохраняем публикацию…");
      const saved = await feedSaveRevisionGuarded(editId, {
        clientRequestId: Crypto.randomUUID(), expectedVersion: created.version,
        text, attachmentIds,
      }, currentEditActor);
      if (!currentEditActor()) return;
      const revision = saved?.pendingRevision;
      if (!saved || saved.id !== editId || saved.author.id !== editActor?.ownerId ||
          saved.version !== created.version + 1 || !revision ||
          revision.status !== "draft" || revision.text !== text.trim() ||
          revision.attachmentIds.length !== attachmentIds.length ||
          revision.attachmentIds.some((id, index) => id !== attachmentIds[index]))
        throw new Error("FEED_EDIT_REVISION_ACK_MISMATCH");
      const published = await feedPublishPostGuarded(editId, {
        clientRequestId: Crypto.randomUUID(),
      }, currentEditActor);
      if (!currentEditActor()) return;
      if (!published || published.id !== editId || published.author.id !== editActor?.ownerId ||
          published.version !== saved.version ||
          (published.status !== "pending" && published.status !== "published") ||
          (published.pendingRevision !== null &&
            published.pendingRevision?.status !== "pending"))
        throw new Error("FEED_EDIT_PUBLISH_ACK_MISMATCH");
      // Same as Web: an accepted revision returns straight to Moments.
      // The feed shows server-owned progress; the post is NOT declared ready.
      editAcknowledged.current = true;
      if (currentEditActor()) {
        for (const asset of picked) releaseFeedPickedMedia(asset);
        for (const option of poll?.options ?? []) {
          if (option.imageAsset) releaseFeedPickedMedia(option.imageAsset);
        }
        router.replace("/(main)/(tabs)/feed" as Href);
        void cache.invalidateQueries({ queryKey: ["feed"] }).catch(() => {
          reportClientError(new Error("FEED_EDIT_CACHE_REFRESH_FAILED"), {
            issueKey: "FeedComposeEdit", keys: { operation: "edit_cache" },
          });
        });
      }
    } catch {
      if (!currentEditActor()) return;
      editUnknown.current = true;
      reportClientError(new Error("FEED_EDIT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedComposeEdit", keys: { operation: "edit_revision_publish" },
      });
      Alert.alert("Моменты", "Результат редактирования публикации неизвестен. Проверьте публикацию перед повторной попыткой.");
    } finally {
      editFlight.current = false;
      if (currentEditActor()) { setBusy(false); setProgress(""); }
    }
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
            items={picked.map(asset => ({ id: asset.requestId, kind: asset.kind,
              uri: asset.previewUri ?? (asset.kind === "photo" ? asset.uri : null) }))}
            onMove={move}
            onRemove={id => setPicked(items => {
              for (const item of items) if (item.requestId === id) releaseFeedPickedMedia(item);
              return items.filter(item => item.requestId !== id);
            })}
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
          disabled={busy || !canSubmit ||
            (isEditing && (!currentEditActor() || editFlight.current ||
              editUnknown.current || editAcknowledged.current))}
          onPress={() => void submit()} />
        {isEditing && editActor && editId &&
          (original.data?.status === "draft" || original.data?.status === "failed") &&
          <View style={{ alignItems: "center" }}>
            <FeedDraftDeleteButton ownerId={editActor.ownerId} postId={editId}
              onDeleted={() => router.replace("/(main)/(tabs)/feed" as Href)} />
          </View>}
      </> : <Status status={status} />}
    </ScrollView>
  </TexturedSafeAreaView>;
}
type FeedDetailActor = { ownerId: string; epoch: string };
type FeedDetailProps = { id: string; commentId?: string };

/** Each composer is scoped to a verified native principal, auth epoch and post. */
export function FeedDetailScreen(props: FeedDetailProps) {
  const ownerId = useAuthStore(state =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor: FeedDetailActor | null =
    ownerId && binding?.principalId === ownerId && binding.authEpoch
      ? { ownerId, epoch: binding.authEpoch }
      : null;
  return <ActorFeedDetailScreen
    key={`${actor?.ownerId ?? "guest"}:${actor?.epoch ?? "unverified"}:${props.id}`}
    {...props} actor={actor} />;
}

function ActorFeedDetailScreen({
  id, commentId, actor,
}: FeedDetailProps & {actor: FeedDetailActor|null}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = useFeedStatus();
  const userId = useAuthStore(state => state.user?.id);
  const [body, setBody] = useState("");
  const [commentFiles, setCommentFiles] = useState<FeedPickedMedia[]>([]);
  const [commentFileFailures,setCommentFileFailures] = useState<Record<string,string>>({});
  // Keep server-confirmed media IDs for this on-screen draft. Retrying one
  // image never re-transcodes/re-sends already accepted neighbor attachments.
  const confirmedCommentMedia = useRef(new Map<string,string>());
  const [uploadCount, setUploadCount] = useState(0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyToName, setReplyToName] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const commentsPageFlight = useRef<{
    postId: string;
    ownerId: string | null;
    epoch: string | null;
  } | null>(null);
  const flight = useRef(false);
  const unknown = useRef(false);
  const composerRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const currentActor = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const changeBody = (value: string) => {
    composerRevision.current += 1;
    setBody(value);
  };
  const composerRef = useRef<TextInput>(null);
  const client = useQueryClient();
  const post = useQuery({ queryKey: ["feed","post",id,userId], queryFn: () => feedApi.getPost(id), refetchInterval: 90_000, enabled: status.data?.enabled === true });
  const comments = useInfiniteQuery({ queryKey: ["feed","comments",id,userId],
    queryFn: ({ pageParam }) => feedApi.listComments(id, { cursor: pageParam }),
    refetchInterval: query => query.state.data?.pages.some(page =>
      page.items.some(item => item.media?.some(media =>
        ["reserved", "uploaded", "processing"].includes(media.status)))) ? 5000 : false,
    initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor,
    enabled: status.data?.enabled === true });
  const currentCommentsReader = () => {
    const state = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    const activeOwner = state.isAuthenticated && !state.isLoading ? state.user?.id : null;
    const activeEpoch = activeOwner && verified?.principalId === activeOwner
      ? verified.authEpoch : null;
    return mounted.current && (actor?.ownerId ?? null) ===
      (activeEpoch ? activeOwner : null) && (actor?.epoch ?? null) === activeEpoch;
  };
  const nextCommentsPage = () => {
    if (!currentCommentsReader() || !comments.hasNextPage || comments.isFetchingNextPage ||
      commentsPageFlight.current ||
      (comments.isError && !comments.isFetchNextPageError)) return;
    const pending = { postId: id, ownerId: actor?.ownerId ?? null, epoch: actor?.epoch ?? null };
    commentsPageFlight.current = pending;
    void comments.fetchNextPage().then(
      () => { if (commentsPageFlight.current === pending) commentsPageFlight.current = null; },
      () => { if (commentsPageFlight.current === pending) commentsPageFlight.current = null; },
    );
  };
  const focused = useQuery({ queryKey: ["feed", "comment", commentId, userId], queryFn: () => feedApi.getComment(commentId!), enabled: !!commentId && status.data?.enabled === true, retry: false });
  const scroll = useRef<ScrollView>(null);
  const focusedY = useRef(0);
  useEffect(() => {
    if (focused.data?.postId === id) scroll.current?.scrollTo({ y: focusedY.current, animated: true });
  }, [focused.data, id]);
  const startReply = (item: FeedCommentDto) => {
    if (!currentActor() || item.postId !== id || item.deleted) return;
    composerRevision.current += 1;
    setReplyTo(item.id);
    setReplyToName(item.author.name);
    composerRef.current?.focus();
  };
  const cancelReply = () => {
    composerRevision.current += 1;
    setReplyTo(null);
    setReplyToName("");
  };
  const attachMedia = async (source: "camera-photo" | "camera-video" | "library") => {
    if (!currentActor() || busy || flight.current) return;
    let picked: FeedPickedMedia[] = [];
    try {
      picked = await pickFeedMedia(source);
      if (!currentActor()) return;
      if (!picked.length) return;
      const next = [...commentFiles, ...picked];
      checkFeedPickedMedia(next);
      composerRevision.current += 1;
      setCommentFiles(next);
      picked = []; // Retain prepared copies for this comment until sent/removed.
    } catch (error) {
      if (currentActor()) Alert.alert("Вложения", errorMessage(error));
    } finally {
      for (const file of picked) releaseFeedPickedMedia(file);
    }
  };
  const retryCommentPhoto = async(requestId:string)=>{
    if(flight.current||busy||unknown.current||!currentActor())return;
    const selected=commentFiles.find(file=>file.requestId===requestId&&file.kind==="photo");
    if(!selected||!commentFileFailures[requestId])return;
    flight.current=true;
    setBusy(true);
    setCommentFileFailures(prev=>{const next={...prev};delete next[requestId];return next;});
    try{
      const mediaId=await uploadPickedFeedMedia(id,selected,undefined,"comment");
      confirmedCommentMedia.current.set(requestId,mediaId);
    }catch(cause){
      if(currentActor())setCommentFileFailures(prev=>({...prev,[requestId]:photoRetryMessage(cause)}));
    }finally{
      flight.current=false;
      if(currentActor())setBusy(false);
    }
  };
  const send = async () => {
    const text = body.trim();
    if (!currentActor() || status.data?.enabled !== true || flight.current || unknown.current ||
        Object.keys(commentFileFailures).length>0 ||
        (!text && !commentFiles.length) ||
        countFeedCharacters(text) > FEED_LIMITS.commentCharacters) return;
    const submissionRevision = composerRevision.current;
    const selectedFiles = [...commentFiles];
    const replyToId = replyTo;
    const clientRequestId = Crypto.randomUUID();
    flight.current = true;
    setBusy(true);
    let commentPostAttempted=false;
    try {
      const mediaIds: string[] = [];
      for (let index = 0; index < selectedFiles.length; index++) {
        if (!currentActor()) return;
        setUploadCount(index);
        const file=selectedFiles[index]!;
        let mediaId=confirmedCommentMedia.current.get(file.requestId);
        if(!mediaId){
          try{
            mediaId=await uploadPickedFeedMedia(id,file,undefined,"comment");
            confirmedCommentMedia.current.set(file.requestId,mediaId);
            setCommentFileFailures(previous=>{
              const next={...previous};delete next[file.requestId];return next;
            });
          }catch(cause){
            if(currentActor())setCommentFileFailures(previous=>({...previous,
              [file.requestId]:file.kind==="photo"?photoRetryMessage(cause):videoRetryMessage(cause),
            }));
            throw cause;
          }
        }
        mediaIds.push(mediaId);
      }
      if (!currentActor()) return;
      commentPostAttempted=true;
      const ack = await feedCreateCommentGuarded(id,
        { text: body, replyToId, clientRequestId, ...(mediaIds.length ? { mediaIds } : {}) },
        currentActor);
      if (!currentActor()) return;
      if (!ack || typeof ack.id !== "string" || !ack.id.trim() ||
          ack.postId !== id || ack.author?.id !== actor?.ownerId ||
          ack.deleted || ack.replyToId !== replyToId || ack.text !== text) {
        throw new Error("FEED_CREATE_COMMENT_ACK_MISMATCH");
      }
      if (composerRevision.current === submissionRevision) {
        composerRevision.current += 1;
        setBody("");
        setCommentFiles([]);
        confirmedCommentMedia.current.clear();
        setCommentFileFailures({});
        for (const file of selectedFiles) releaseFeedPickedMedia(file);
        setUploadCount(0);
        setReplyTo(null);
        setReplyToName("");
      }
      try {
        await client.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        if (currentActor()) reportClientError(new Error("FEED_CREATE_COMMENT_CACHE_FAILURE"), {
          issueKey: "FeedDetailComment", keys: { operation: "create_comment_cache" },
        });
      }
    } catch {
      if (!currentActor()) return;
      if(!commentPostAttempted){
        // A device WebP/S3 error has not sent the comment. Keep all original
        // files and confirmed photo IDs, allow the failed tile to retry.
        return;
      }
      unknown.current = true;
      reportClientError(new Error("FEED_CREATE_COMMENT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedDetailComment", keys: { operation: "create_comment" },
      });
      Alert.alert("Комментарий", "Результат отправки комментария неизвестен. Проверьте публикацию перед повторной попыткой.");
    } finally {
      flight.current = false;
      if (currentActor()) setBusy(false);
    }
  };
  const sendDisabled = busy || flight.current || unknown.current ||
    Object.keys(commentFileFailures).length>0 || !currentActor() ||
    (!body.trim() && !commentFiles.length) ||
    countFeedCharacters(body) > FEED_LIMITS.commentCharacters;
  return <TexturedSafeAreaView style={s.screen} edges={["top","left","right"]}>
    <KeyboardAvoidingView style={s.screen} behavior="padding">
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
              {focused.data?.postId === id && <CommentRow item={focused.data} postId={id} onReply={startReply} />}
            </View>}
            {comments.isPending && <Loading variant="inline" message="Загрузка комментариев…" />}
            {comments.isError && !comments.isFetchNextPageError && <>
              <Text style={s.error}>{errorMessage(comments.error)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Повторить загрузку комментариев"
                style={s.moreComments} onPress={() => void comments.refetch()}>
                <Text style={s.more}>Повторить загрузку комментариев</Text>
              </Pressable>
            </>}
            {comments.data?.pages.flatMap(page => page.items)
              .filter(item => item.id !== (focused.data?.postId === id ? commentId : null))
              .map(item => <CommentRow key={item.id} item={item} postId={id} onReply={startReply} />)}
            {comments.isFetchNextPageError && <Text accessibilityRole="alert" style={s.error}>
              Не удалось загрузить следующую страницу комментариев.{" "}
              Уже показанные комментарии доступны.
            </Text>}
            {comments.hasNextPage && <Pressable accessibilityRole="button" style={s.moreComments}
              accessibilityLabel={comments.isFetchNextPageError
                ? "Повторить страницу комментариев" : "Показать ещё комментарии"}
              disabled={comments.isFetchingNextPage} onPress={nextCommentsPage}>
              <Text style={s.more}>{comments.isFetchingNextPage ? "Загрузка…"
                : comments.isFetchNextPageError ? "Повторить страницу комментариев"
                  : "Показать ещё комментарии"}</Text>
            </Pressable>}
            {comments.isFetchingNextPage && <MascotSpinner />}
            {!comments.isPending && !comments.isError && !comments.data?.pages.flatMap(page => page.items).length && !focused.data &&
              <Muted>Пока нет комментариев. Напишите первым.</Muted>}
          </View>
        </>}
      </ScrollView>
      {status.data?.enabled === true && <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {commentFiles.length > 0 && <ScrollView horizontal keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 90 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {commentFiles.map((file, index) => <View key={file.requestId}
            style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden",
              backgroundColor: COLORS.background, justifyContent: "center" }}>
            {file.kind === "photo"
              ? <Image source={{ uri: file.uri }} style={{ width: 80, height: 80 }} />
              : <MaterialCommunityIcons name="video" size={32} color={COLORS.primary}
                  style={{ alignSelf: "center" }} />}
            {file.kind === "photo" && commentFileFailures[file.requestId] &&
              <Pressable accessibilityRole="button"
                accessibilityLabel={`Повторить обработку фото ${file.filename}`}
                disabled={busy} onPress={()=>void retryCommentPhoto(file.requestId)}
                style={{position:"absolute",left:14,top:14,width:50,height:50,
                  borderRadius:25,backgroundColor:"#17211def",borderWidth:1,
                  borderColor:"#ffffffcc",alignItems:"center",justifyContent:"center"}}>
                <MaterialCommunityIcons name="refresh" size={29} color="#fff"/>
              </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={"Убрать вложение " + (index + 1)}
              disabled={busy} onPress={() => {
                composerRevision.current += 1;
                confirmedCommentMedia.current.delete(file.requestId);
                setCommentFileFailures(previous=>{
                  const next={...previous};delete next[file.requestId];return next;
                });
                setCommentFiles(list => {
                  for (const item of list) if (item.requestId === file.requestId) releaseFeedPickedMedia(item);
                  return list.filter(item => item.requestId !== file.requestId);
                });
              }} style={{ position: "absolute", right: 0, top: 0, backgroundColor: "#242424AA",
                borderRadius: 12, padding: 2 }}>
              <MaterialCommunityIcons name="close" size={15} color="#fff" />
            </Pressable>
          </View>)}
        </ScrollView>}
        {commentFiles.some(file=>commentFileFailures[file.requestId]) &&
          <Text accessibilityRole="alert" style={{color:"#923b22",fontSize:12,lineHeight:18,
            marginBottom:6}}>
            {commentFiles.filter(file=>commentFileFailures[file.requestId]).map(file=>
              `${file.filename}: ${commentFileFailures[file.requestId]}`).join(" ")}
          </Text>}
        {busy && commentFiles.length > 0 && <Text accessibilityRole="text"
          style={s.composerLimit}>Загружаем вложения: {Math.min(uploadCount + 1, commentFiles.length)}/{commentFiles.length}</Text>}
        {replyTo && <View style={s.replyBanner}>
          <MaterialCommunityIcons name="reply" size={16} color={COLORS.primary} />
          <Text numberOfLines={1} style={s.replyBannerText}>Ответ для {replyToName}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Отменить ответ"
            style={s.replyCancel} onPress={cancelReply}>
            <MaterialCommunityIcons name="close" size={18} color={COLORS.textSecondary} />
          </Pressable>
        </View>}
        <View style={s.composerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Прикрепить фото или видео"
            disabled={busy} onPress={() => Alert.alert("Прикрепить медиа",
              "Выберите источник фото или видео", [
                { text: "Галерея", onPress: () => void attachMedia("library") },
                { text: "Сделать фото", onPress: () => void attachMedia("camera-photo") },
                { text: "Снять видео", onPress: () => void attachMedia("camera-video") },
                { text: "Отмена", style: "cancel" },
              ])}
            style={{ padding: 8 }}>
            <MaterialCommunityIcons name="paperclip" size={24} color={COLORS.primary} />
          </Pressable>
          <TextInput ref={composerRef} value={body} onChangeText={changeBody}
            multiline textAlignVertical="center" style={s.composerInput}
            accessibilityLabel="Написать комментарий"
            placeholder={replyTo ? "Написать ответ…" : "Комментарий…"}
            placeholderTextColor={COLORS.textSecondary} />
          <Pressable accessibilityRole="button"
            accessibilityLabel={busy ? "Отправка…" : "Отправить комментарий"}
            accessibilityState={{ disabled: sendDisabled }}
            style={[s.composerSend, sendDisabled && s.composerSendDisabled]}
            disabled={sendDisabled}
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
type CommentRowProps = {
  item: FeedCommentDto;
  postId: string;
  onReply: (item: FeedCommentDto) => void;
};
type CommentActor = { ownerId: string; epoch: string };

/** Card identity resets owner mutation locks whenever the principal/epoch changes. */
export function CommentRow(props: CommentRowProps) {
  const ownerId = useAuthStore(state =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor: CommentActor | null =
    ownerId && binding?.principalId === ownerId && binding.authEpoch
      ? { ownerId, epoch: binding.authEpoch }
      : null;
  return <ActorCommentRow
    key={`${actor?.ownerId ?? "guest"}:${actor?.epoch ?? "none"}:${props.postId}:${props.item.id}`}
    {...props} actor={actor} />;
}

function ActorCommentRow({
  item, postId, onReply, actor,
}: CommentRowProps & { actor: CommentActor | null }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const [confirmedReaction, setConfirmedReaction] =
    useState<FeedReaction | null | undefined>(undefined);
  const reactionFlight = useRef(false);
  const reactionUnknown = useRef(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [deletedLocal, setDeletedLocal] = useState(false);
  const [confirmedText, setConfirmedText] = useState<string | null>(null);
  const [showReplies, setShowReplies] = useState(false);
  const repliesPageFlight = useRef<{
    commentId: string;
    postId: string;
    ownerId: string | null;
    epoch: string | null;
  } | null>(null);
  const mounted = useRef(true);
  const ownerFlight = useRef(false);
  const ownerUnknown = useRef(false);
  const deletedAcknowledged = useRef(false);
  const editAcknowledged = useRef<string | null>(null);
  const menuIssued = useRef(false);
  const confirmationId = useRef<number | null>(null);
  const nextConfirmationId = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; confirmationId.current = null; };
  }, []);
  const currentOwner = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      item.author.id === actor.ownerId && item.postId === postId &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const canManage = currentOwner() && !item.deleted && !deletedAcknowledged.current;
  const currentReactionActor = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      item.postId === postId && !item.deleted && !deletedAcknowledged.current &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const replies = useInfiniteQuery({
    queryKey: ["feed", "replies", item.id],
    queryFn: ({ pageParam }) => feedApi.listReplies(item.id, { cursor: pageParam }),
    refetchInterval: query => showReplies && query.state.data?.pages.some(page =>
      page.items.some(reply => reply.media?.some(media =>
        ["reserved", "uploaded", "processing"].includes(media.status)))) ? 5000 : false,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: showReplies && !item.rootId,
  });
  const currentRepliesReader = () => {
    const state = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    const activeOwner = state.isAuthenticated && !state.isLoading ? state.user?.id : null;
    const activeEpoch = activeOwner && verified?.principalId === activeOwner
      ? verified.authEpoch : null;
    return mounted.current && item.postId === postId &&
      (actor?.ownerId ?? null) === (activeEpoch ? activeOwner : null) &&
      (actor?.epoch ?? null) === activeEpoch;
  };
  const nextRepliesPage = () => {
    if (!currentRepliesReader() || !replies.hasNextPage || replies.isFetchingNextPage ||
      repliesPageFlight.current ||
      (replies.isError && !replies.isFetchNextPageError)) return;
    const flight = {
      commentId: item.id,
      postId,
      ownerId: actor?.ownerId ?? null,
      epoch: actor?.epoch ?? null,
    };
    repliesPageFlight.current = flight;
    void replies.fetchNextPage().then(
      () => { if (repliesPageFlight.current === flight) repliesPageFlight.current = null; },
      () => { if (repliesPageFlight.current === flight) repliesPageFlight.current = null; },
    );
  };
  const runReaction = async (reaction: FeedReaction) => {
    if (reactionFlight.current || reactionUnknown.current || ownerFlight.current ||
        !currentReactionActor()) return;
    const previous = confirmedReaction !== undefined ? confirmedReaction : item.myReaction;
    const next = previous === reaction ? null : reaction;
    reactionFlight.current = true;
    setBusy(true);
    try {
      const ack = await feedCommentReactionGuarded(item.id, next, currentReactionActor);
      if (!currentReactionActor()) return;
      if (!ack || ack.id !== item.id || ack.postId !== postId ||
          ack.deleted || ack.myReaction !== next) throw new Error("FEED_COMMENT_REACTION_ACK_MISMATCH");
      setConfirmedReaction(next);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch { reportClientError(new Error("FEED_COMMENT_REACTION_CACHE_FAILURE"), {
        issueKey: "FeedCommentReaction", keys: { operation: "reaction_cache" },
      }); }
    } catch {
      if (!currentReactionActor()) return;
      reactionUnknown.current = true;
      reportClientError(new Error("FEED_COMMENT_REACTION_UNCONFIRMED"), {
        issueKey: "FeedCommentReaction", keys: { operation: "comment_reaction" },
      });
      Alert.alert("Комментарий", "Результат реакции неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      reactionFlight.current = false;
      if (currentReactionActor()) setBusy(false);
    }
  };
  const saveEdit = async () => {
    if (reactionFlight.current) return;
    const text = draft;
    if (!item.canEdit || !canManage || !currentOwner() ||
        ownerFlight.current || ownerUnknown.current || deletedAcknowledged.current ||
        !text.trim() || countFeedCharacters(text) > FEED_LIMITS.commentCharacters ||
        editAcknowledged.current === text) return;
    ownerFlight.current = true;
    setOwnerBusy(true);
    try {
      const ack = await feedEditCommentGuarded(item.id, { text }, currentOwner);
      if (!currentOwner()) return;
      if (!ack || ack.id !== item.id || ack.postId !== postId ||
          ack.author?.id !== actor?.ownerId || ack.deleted || typeof ack.text !== "string")
        throw new Error("FEED_COMMENT_EDIT_ACK_MISMATCH");
      editAcknowledged.current = text;
      setConfirmedText(ack.text);
      setEditing(false);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch { reportClientError(new Error("FEED_COMMENT_EDIT_CACHE_FAILURE"), {
        issueKey: "FeedCommentOwner", keys: { operation: "edit_cache" },
      }); }
    } catch {
      if (!currentOwner()) return;
      ownerUnknown.current = true;
      reportClientError(new Error("FEED_COMMENT_EDIT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedCommentOwner", keys: { operation: "edit_comment" },
      });
      Alert.alert("Комментарий", "Результат изменения комментария неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      ownerFlight.current = false;
      if (currentOwner()) setOwnerBusy(false);
    }
  };
  const deleteConfirmed = async () => {
    if (reactionFlight.current || !item.canDelete || !currentOwner() || ownerFlight.current ||
        ownerUnknown.current || deletedAcknowledged.current) return;
    ownerFlight.current = true;
    setOwnerBusy(true);
    try {
      const ack = await feedDeleteCommentGuarded(item.id, currentOwner);
      if (!currentOwner()) return;
      if (!ack || ack.id !== item.id) throw new Error("FEED_COMMENT_DELETE_ACK_MISMATCH");
      deletedAcknowledged.current = true;
      setDeletedLocal(true);
      setEditing(false);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch { reportClientError(new Error("FEED_COMMENT_DELETE_CACHE_FAILURE"), {
        issueKey: "FeedCommentOwner", keys: { operation: "delete_cache" },
      }); }
    } catch {
      if (!currentOwner()) return;
      ownerUnknown.current = true;
      reportClientError(new Error("FEED_COMMENT_DELETE_RESULT_UNCONFIRMED"), {
        issueKey: "FeedCommentOwner", keys: { operation: "delete_comment" },
      });
      Alert.alert("Комментарий", "Результат удаления комментария неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      ownerFlight.current = false;
      if (currentOwner()) setOwnerBusy(false);
    }
  };
  const requestDelete = () => {
    if (reactionFlight.current || !item.canDelete || !currentOwner() || ownerFlight.current ||
        ownerUnknown.current || deletedAcknowledged.current ||
        confirmationId.current !== null) return;
    const token = ++nextConfirmationId.current;
    confirmationId.current = token;
    Alert.alert("Удалить комментарий?", "Отменить удаление будет нельзя.", [
      { text: "Отмена", style: "cancel", onPress: () => {
        if (confirmationId.current === token) confirmationId.current = null;
      } },
      { text: "Удалить", style: "destructive", onPress: () => {
        if (confirmationId.current !== token) return;
        confirmationId.current = null;
        if (currentOwner()) void deleteConfirmed();
      } },
    ]);
  };
  const openActions = () => {
    if (busy || ownerBusy || ownerFlight.current || ownerUnknown.current || reactionFlight.current ||
        menuIssued.current || confirmationId.current !== null || !canManage ||
        (!item.canEdit && !item.canDelete)) return;
    menuIssued.current = true;
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (item.canEdit) options.push({ text: "Изменить", onPress: () => {
      menuIssued.current = false;
      if (!currentOwner() || ownerUnknown.current) return;
      setDraft(editAcknowledged.current ?? confirmedText ?? item.text);
      setEditing(true);
    } });
    if (item.canDelete) options.push({ text: "Удалить", style: "destructive", onPress: () => {
      menuIssued.current = false;
      requestDelete();
    } });
    options.push({ text: "Отмена", style: "cancel", onPress: () => { menuIssued.current = false; } });
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
          {canManage && !ownerUnknown.current && (item.canEdit || item.canDelete) &&
            <Pressable accessibilityRole="button" accessibilityLabel="Действия с комментарием"
              style={s.commentMenuButton} disabled={busy || ownerBusy} onPress={openActions}>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={COLORS.textSecondary} />
            </Pressable>}
        </View>
        {item.replyToName && <Text numberOfLines={1} style={s.commentReplyLabel}>↪ {item.replyToName}</Text>}
        {editing && canManage && !ownerUnknown.current
          ? <View style={s.inlineEditor}>
              <TextInput style={s.inlineEditInput} multiline value={draft} onChangeText={setDraft}
                placeholder="Изменить комментарий" placeholderTextColor={COLORS.textSecondary} />
              <View style={s.inlineEditActions}>
                <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={s.commentAction}>
                  <Text style={s.commentActionText}>Отмена</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  disabled={busy || ownerBusy || !draft.trim() ||
                    countFeedCharacters(draft) > FEED_LIMITS.commentCharacters}
                  onPress={() => void saveEdit()} style={s.commentAction}>
                  <Text style={s.commentActionText}>Сохранить</Text>
                </Pressable>
              </View>
            </View>
          : <Pressable onLongPress={openActions} disabled={!canManage || (!item.canEdit && !item.canDelete)}>
              <Text style={[s.commentBody, (item.deleted || deletedLocal) && s.deletedComment]}>
                {(item.deleted || deletedLocal) ? "Комментарий удалён" : (confirmedText ?? item.text)}
              </Text>
            </Pressable>}
        {!item.deleted && !deletedLocal && !!item.media?.length &&
          <FeedCommentAttachments postId={item.postId} media={item.media} />}
        {!item.deleted && !deletedLocal && !item.canEdit && <FeedReportButton type="comment" id={item.id} authorId={item.author.id} />}
        {!item.deleted && !deletedLocal && !editing && <View style={s.commentActions}>
          <FeedReactionStrip reactions={item.reactions}
            myReaction={confirmedReaction !== undefined ? confirmedReaction : item.myReaction}
            busy={busy || reactionUnknown.current || ownerBusy || !currentReactionActor()}
            onSelect={async emoji => { await runReaction(emoji); }} />
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
      {replies.isError && !replies.isFetchNextPageError && <Pressable accessibilityRole="button"
        accessibilityLabel="Повторить загрузку ответов"
        onPress={() => void replies.refetch()} style={s.moreComments}>
        <Text style={s.more}>Повторить загрузку ответов</Text>
      </Pressable>}
      {replies.data?.pages.flatMap(page => page.items).map(reply =>
        <CommentRow key={reply.id} item={reply} postId={postId} onReply={onReply} />)}
      {replies.isFetchNextPageError && <Text accessibilityRole="alert" style={s.error}>
        Не удалось загрузить следующую страницу ответов. Уже загруженные ответы доступны.
      </Text>}
      {replies.hasNextPage && <Pressable accessibilityRole="button"
        accessibilityLabel={replies.isFetchNextPageError
          ? "Повторить страницу ответов ветки" : "Ещё ответы ветки"}
        style={s.moreComments} disabled={replies.isFetchingNextPage}
        onPress={nextRepliesPage}>
        <Text style={s.more}>{replies.isFetchingNextPage ? "Загрузка…"
          : replies.isFetchNextPageError ? "Повторить страницу ответов" : "Ещё ответы"}</Text>
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
  publicationProgressLabel: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  publicationLink: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary,
    paddingVertical: 5, textDecorationLine: "underline" },
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
  commentsBlock: { backgroundColor: COLORS.cardBackground, borderRadius: 18, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  commentsHeading: { fontFamily: FONTS.montserratMedium, fontSize: 17, lineHeight: 23, color: COLORS.text, paddingBottom: 7 },
  focusedComment: { backgroundColor: "#e7eadb", borderRadius: 12, paddingHorizontal: 8 },
  comment: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e9ebdf", paddingVertical: 12, gap: 4 },
  commentLine: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  commentAvatarTap: { width: 32, height: 32 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarInitial: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 13 },
  commentContent: { flex: 1, minWidth: 0, gap: 3 },
  commentMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 23 },
  commentAuthorTap: { flexShrink: 1, minWidth: 0 },
  commentAuthorName: { fontFamily: FONTS.montserratMedium, fontSize: 13, lineHeight: 18, color: COLORS.text },
  commentTime: { flexShrink: 1, fontFamily: FONTS.montserrat, fontSize: 11, color: COLORS.textSecondary },
  commentMenuButton: { marginLeft: "auto", width: 28, height: 30, alignItems: "center", justifyContent: "center" },
  commentReplyLabel: { fontFamily: FONTS.montserrat, fontSize: 11, color: COLORS.textSecondary },
  commentBody: { fontFamily: FONTS.montserrat, fontSize: 14, lineHeight: 20, color: COLORS.text },
  deletedComment: { color: COLORS.textSecondary, fontStyle: "italic" },
  commentActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-start", gap: 10 },
  commentReplyButton: { minHeight: 30, paddingHorizontal: 4, justifyContent: "center" },
  commentAction: { minHeight: 36, paddingHorizontal: 6, justifyContent: "center" },
  commentActionText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  showRepliesButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30, marginTop: 3 },
  threadReplies: { marginLeft: 38, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "#dde4d3", paddingLeft: 10 },
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

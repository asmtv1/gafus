import { FeedPostOwnerActions } from "./FeedPostOwnerActions";
import { memo, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter, type Href } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { formatFeedTime, getFeedAuthorRoleBadge, type FeedPostDto, type FeedReaction } from "@gafus/types";
import { COLORS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi, feedPostReactionGuarded } from "@/shared/lib/api/feed";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/error-reporting";
import { FeedVideo, stopFeedVideoOutsidePosts } from "./FeedVideo";
import { mobileFeedTelemetry } from "./telemetry";
import { FeedMediaViewer } from "./FeedMediaViewer";
import { getFeedPreviewHeight } from "./feedMediaLayout";
import { feedV2PreviewHeight } from "./feedV2PreviewHeight";
import { FeedCarouselDots } from "./FeedCarouselDots";
import { FeedPollCard } from "./FeedPollCard";
import { FeedReactionStrip } from "./FeedReactionStrip";
import { s, Muted } from "./feedScreenShared";
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

export const FeedPostCard = memo(function FeedPostCard({ post, detailed = false }: { post: FeedPostDto; detailed?: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [mediaPosition, setMediaPosition] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaWidth, setMediaWidth] = useState(320);
  const { height: viewportHeight } = useWindowDimensions();
  useEffect(() => { setExpanded(false); setMediaPosition(0); setViewerIndex(null); }, [post.id]);
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
});

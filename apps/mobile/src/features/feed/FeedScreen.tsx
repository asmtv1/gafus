import { useScreenDataReady } from "@/shared/lib/telemetry/useScreenDataReady";
import { reportClientError } from "@/shared/lib/error-reporting";
import { measureMobileOperation } from "@/shared/lib/telemetry/mobilePerformance";
import { mobileFeedPublications } from "./publication";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect, type Href } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { FEED_LIMITS, type FeedPostDto, type FeedSort } from "@gafus/types";
import { Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore } from "@/shared/stores";
import { Button } from "@/shared/components";
import { feedApi } from "@/shared/lib/api/feed";
import { stopFeedVideoOutsidePosts } from "./FeedVideo";
import { mobileFeedTelemetry } from "./telemetry";
import { FeedSortControl } from "./FeedSortControl";
import { FeedSmartPreferences } from "./FeedSmartPreferences";
import { BOOKMARK_ARTWORK_URI } from "./bookmarkArtwork";
import { MOMENTS_HEADER_URI } from "./momentsHeaderArtwork";
import { s, useFeedStatus, EMPTY_PUBLICATIONS, Status, Muted, errorMessage } from "./feedScreenShared";
import { FeedPostCard } from "./FeedPostCard";
import { FeedPublicationQueue } from "./FeedPublicationQueue";
function feedPostKey(item: FeedPostDto) { return item.id; }

function renderFeedPost({item}: {item: FeedPostDto}) {
  return <View style={s.listItem}><FeedPostCard post={item} /></View>;
}

export function FeedScreen() {
  const router = useRouter();
  const [smartSettingsOpen, setSmartSettingsOpen] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const compactControls = screenWidth < 360;
  const [sort, setSort] = useState<FeedSort>("new");
  const userId = useAuthStore(state => state.user?.id);
  const diagnosticEpoch = useAuthStore(state => state.verifiedSessionEpoch);
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
    }).catch(error => reportClientError(error,{issueKey:"FeedSortStorageRead",severity:"warning"}));
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
    queryFn: ({ pageParam }) => measureMobileOperation(pageParam === null ? "FEED_FIRST_PAGE_LOAD" : "FEED_NEXT_PAGE_LOAD",
      () => feedApi.listPosts({ cursor: pageParam, sort })),
    refetchInterval: 90_000,
    initialPageParam: null as string | null,
    getNextPageParam: value => value.nextCursor,
    enabled: !!userId && status.data?.enabled === true,
  });
  useScreenDataReady("SCREEN_FEED_DATA_READY",
    !!userId && status.data?.enabled === true && !status.isError &&
      !pages.isPending && (!pages.isError || pages.isFetchNextPageError) &&
      !!pages.data?.pages[0], JSON.stringify([userId, diagnosticEpoch, sort]));
  const posts = useMemo(() => pages.data?.pages.flatMap(page => page.items) ?? [], [pages.data]);
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
      void feedApi.recordView(item.id).catch(() => { /* diagnostic: expected View tracking is best effort; clear seen mark for later retry. */ return seen.current.delete(item.id); });
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
    <StatusBar style="dark" />
    {status.isPending ? <Loading fullScreen embedded /> :
      status.data?.enabled !== true ? <View style={s.padding}>{listHeader}<Status status={status} /></View> :
      <FlashList
        key={sort}
        data={posts}
        ListHeaderComponent={listHeader}
        keyExtractor={feedPostKey}
        renderItem={renderFeedPost}
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

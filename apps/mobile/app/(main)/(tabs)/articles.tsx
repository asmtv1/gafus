import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  InteractionManager,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { ArticleListDto } from "@gafus/types";

import { Loading } from "@/shared/components/ui";
import { articlesApi } from "@/shared/lib/api";
import { articlesQueryOptions } from "@/shared/lib/api/articlesQuery";
import { trackEvent } from "@/shared/lib/analytics";
import { getArticleLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { COLORS, SPACING, FONTS, BORDER_RADIUS, UI_TIMEOUTS } from "@/constants";

const ARTICLE_COVER_PLACEHOLDER_DELAY_MS = 140;
/** Сколько обложек префетчим в фоне (ускорение без привязки к снятию оверлея). */
const ARTICLE_COVER_PREFETCH_LIMIT = 12;
/** Сколько первых карточек считаем «видимым вьюпортом»: пока их обложки не готовы — полный оверлей. */
const VIEWPORT_ARTICLE_COVER_GATE_COUNT = 6;
/** После onDisplay у expo-image — короткая пауза, чтобы не было «вспышки» между оверлеем и списком. */
const VIEWPORT_OVERLAY_SETTLE_MS = 96;
/** Failsafe: если события обложек не пришли, не держим оверлей бесконечно. */
const VIEWPORT_GATE_FAILSAFE_MS = UI_TIMEOUTS.articleViewportGateFailsafe;

function formatViews(n: number): string {
  const last = n % 10;
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 19) return `${n} просмотров`;
  if (last === 1) return `${n} просмотр`;
  if (last >= 2 && last <= 4) return `${n} просмотра`;
  return `${n} просмотров`;
}

function getVersionedImageUrl(
  rawUrl: string | null | undefined,
  updatedAt: string | null | undefined,
): string | null {
  const resolved = resolveImageUrl(rawUrl);
  if (!resolved) return null;
  const version =
    updatedAt != null ? new Date(updatedAt).getTime().toString() : "no-version";
  return `${resolved}${resolved.includes("?") ? "&" : "?"}v=${version}`;
}

function articleHasCover(a: ArticleListDto): boolean {
  const rawCover = a.logoImg || a.imageUrls?.[0];
  return getVersionedImageUrl(rawCover, a.updatedAt) != null;
}

function getArticleCoverPrefetchUris(
  items: ArticleListDto[],
  limit = ARTICLE_COVER_PREFETCH_LIMIT,
): string[] {
  const uris: string[] = [];
  for (const article of items.slice(0, limit)) {
    const rawCover = article.logoImg || article.imageUrls?.[0];
    const coverUrl = getVersionedImageUrl(rawCover, article.updatedAt);
    if (!coverUrl) continue;
    const candidates = getArticleLogoVariantCandidates(coverUrl);
    const first = candidates[0];
    if (first) uris.push(first);
  }
  return uris;
}

interface ArticleCardProps {
  article: ArticleListDto;
  onLike: (articleId: string) => void;
  isLikePending: boolean;
  listIndex: number;
  viewportGateCount: number;
  onViewportCoverReady?: (articleId: string) => void;
}

const ArticleCard = memo(function ArticleCard({
  article,
  onLike,
  isLikePending,
  listIndex,
  viewportGateCount,
  onViewportCoverReady,
}: ArticleCardProps) {
  const router = useRouter();
  const rawCover = article.logoImg || article.imageUrls?.[0];
  const coverUrl = getVersionedImageUrl(rawCover, article.updatedAt);
  const coverCandidates = useMemo(
    () => getArticleLogoVariantCandidates(coverUrl),
    [coverUrl],
  );
  const [coverCandidateIndex, setCoverCandidateIndex] = useState(0);
  const hasNextCoverFallback = coverCandidateIndex < coverCandidates.length - 1;
  const currentCoverUrl = coverCandidates[coverCandidateIndex];
  const coverCacheKey = `article-${article.id}-${new Date(article.updatedAt).getTime()}-${coverCandidateIndex}`;
  const [isCoverLoading, setIsCoverLoading] = useState(false);
  const [showCoverPlaceholder, setShowCoverPlaceholder] = useState(false);
  const coverPlaceholderDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportReadyReportedRef = useRef(false);

  const isInViewportGate =
    listIndex < viewportGateCount && typeof onViewportCoverReady === "function";

  const maybeReportViewportCoverReady = useCallback(() => {
    if (!isInViewportGate || viewportReadyReportedRef.current) return;
    viewportReadyReportedRef.current = true;
    onViewportCoverReady?.(article.id);
  }, [article.id, isInViewportGate, onViewportCoverReady]);

  useEffect(() => {
    viewportReadyReportedRef.current = false;
  }, [article.id]);

  useEffect(() => {
    setCoverCandidateIndex(0);
  }, [coverUrl]);

  useEffect(() => {
    if (coverPlaceholderDelayTimeoutRef.current) {
      clearTimeout(coverPlaceholderDelayTimeoutRef.current);
      coverPlaceholderDelayTimeoutRef.current = null;
    }

    if (!currentCoverUrl) {
      setIsCoverLoading(false);
      setShowCoverPlaceholder(false);
      return;
    }

    setIsCoverLoading(true);
    setShowCoverPlaceholder(false);
    if (isInViewportGate) return;
    coverPlaceholderDelayTimeoutRef.current = setTimeout(() => {
      setShowCoverPlaceholder(true);
    }, ARTICLE_COVER_PLACEHOLDER_DELAY_MS);
  }, [article.id, currentCoverUrl, isInViewportGate]);

  useEffect(() => {
    if (!isInViewportGate || currentCoverUrl) return;
    maybeReportViewportCoverReady();
  }, [currentCoverUrl, isInViewportGate, maybeReportViewportCoverReady]);

  useEffect(() => {
    return () => {
      if (!coverPlaceholderDelayTimeoutRef.current) return;
      clearTimeout(coverPlaceholderDelayTimeoutRef.current);
      coverPlaceholderDelayTimeoutRef.current = null;
    };
  }, []);

  const handleLikePress = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    onLike(article.id);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push(
          `/articles/${article.slug}` as Parameters<typeof router.push>[0]
        )
      }
    >
      <View style={styles.row}>
        <View style={styles.logoBox}>
          {currentCoverUrl ? (
            <>
              <Image
                source={{ uri: currentCoverUrl, cacheKey: coverCacheKey }}
                style={styles.logoImage}
                contentFit="cover"
                recyclingKey={coverCacheKey}
                cachePolicy="memory-disk"
                priority={isInViewportGate ? "high" : "normal"}
                transition={0}
                accessibilityLabel={`Обложка статьи «${article.title}»`}
                onLoadStart={() => {
                  if (coverPlaceholderDelayTimeoutRef.current) {
                    clearTimeout(coverPlaceholderDelayTimeoutRef.current);
                    coverPlaceholderDelayTimeoutRef.current = null;
                  }
                  setIsCoverLoading(true);
                  setShowCoverPlaceholder(false);
                  if (isInViewportGate) return;
                  coverPlaceholderDelayTimeoutRef.current = setTimeout(() => {
                    setShowCoverPlaceholder(true);
                  }, ARTICLE_COVER_PLACEHOLDER_DELAY_MS);
                }}
                onLoadEnd={() => {
                  if (coverPlaceholderDelayTimeoutRef.current) {
                    clearTimeout(coverPlaceholderDelayTimeoutRef.current);
                    coverPlaceholderDelayTimeoutRef.current = null;
                  }
                  setIsCoverLoading(false);
                  setShowCoverPlaceholder(false);
                  if (!hasNextCoverFallback) {
                    maybeReportViewportCoverReady();
                  }
                }}
                onDisplay={() => {
                  if (coverPlaceholderDelayTimeoutRef.current) {
                    clearTimeout(coverPlaceholderDelayTimeoutRef.current);
                    coverPlaceholderDelayTimeoutRef.current = null;
                  }
                  setIsCoverLoading(false);
                  setShowCoverPlaceholder(false);
                  maybeReportViewportCoverReady();
                }}
                onError={() => {
                  if (hasNextCoverFallback) {
                    if (coverPlaceholderDelayTimeoutRef.current) {
                      clearTimeout(coverPlaceholderDelayTimeoutRef.current);
                      coverPlaceholderDelayTimeoutRef.current = null;
                    }
                    setCoverCandidateIndex((prev) => prev + 1);
                    setIsCoverLoading(true);
                    setShowCoverPlaceholder(false);
                    if (!isInViewportGate) {
                      coverPlaceholderDelayTimeoutRef.current = setTimeout(() => {
                        setShowCoverPlaceholder(true);
                      }, ARTICLE_COVER_PLACEHOLDER_DELAY_MS);
                    }
                    return;
                  }
                  setIsCoverLoading(false);
                  setShowCoverPlaceholder(false);
                  maybeReportViewportCoverReady();
                }}
              />
              {isCoverLoading && showCoverPlaceholder && !isInViewportGate && (
                <View style={styles.logoLoadingPlaceholder}>
                  <MaterialCommunityIcons
                    name="image-outline"
                    size={28}
                    color={COLORS.textSecondary}
                  />
                </View>
              )}
            </>
          ) : (
            <View style={styles.logoPlaceholder}>
              <MaterialCommunityIcons
                name="newspaper-variant-outline"
                size={32}
                color={COLORS.textSecondary}
              />
            </View>
          )}
          {article.visibility === "PAID" && (
            <View style={styles.paidBadge}>
              <Text style={styles.paidBadgeText}>Платная</Text>
            </View>
          )}
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {article.title}
          </Text>
          <View style={styles.meta}>
            <View style={styles.metaCol}>
              <Text style={styles.metaText}>{article.authorUsername}</Text>
              <Text style={styles.metaText}>
                {formatViews(article.viewCount ?? 0)}
              </Text>
              <Text style={styles.metaText}>
                {new Date(article.createdAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
            <Pressable
              style={({ pressed: p }) => [styles.likeButton, p && styles.likeButtonPressed]}
              onPress={handleLikePress}
              disabled={isLikePending}
              hitSlop={8}
              accessibilityLabel={article.isLiked ? "Убрать лайк" : "Нравится"}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={article.isLiked ? "heart" : "heart-outline"}
                size={14}
                color={article.isLiked ? "#e63946" : "rgba(255,255,255,0.9)"}
              />
              <Text style={styles.likeButtonText}>{article.likeCount}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export default function ArticlesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const queryClient = useQueryClient();
  const viewportFailsafeTrackedKeyRef = useRef<string>("");

  const { data, isPending, error, refetch } = useQuery(articlesQueryOptions);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
    }, [queryClient]),
  );

  const articles = useMemo(() => data?.data ?? [], [data?.data]);

  const gateArticles = useMemo(
    () => articles.slice(0, VIEWPORT_ARTICLE_COVER_GATE_COUNT),
    [articles],
  );

  const viewportGateSyncKey = useMemo(
    () => gateArticles.map((a) => `${a.id}:${a.updatedAt}`).join("|"),
    [gateArticles],
  );

  const viewportGatePendingIdsRef = useRef<Set<string>>(new Set());
  const viewportGateKeyRef = useRef<string>("");

  if (viewportGateKeyRef.current !== viewportGateSyncKey) {
    viewportGateKeyRef.current = viewportGateSyncKey;
    const next = new Set<string>();
    for (const a of gateArticles) {
      if (articleHasCover(a)) next.add(a.id);
    }
    viewportGatePendingIdsRef.current = next;
  }

  useLayoutEffect(() => {
    if (isPending) {
      setViewportReady(false);
      return;
    }
    if (articles.length === 0) {
      setViewportReady(true);
      return;
    }
    setViewportReady(viewportGatePendingIdsRef.current.size === 0);
  }, [isPending, articles.length, viewportGateSyncKey]);

  const handleViewportCoverReady = useCallback((articleId: string) => {
    const pending = viewportGatePendingIdsRef.current;
    if (!pending.has(articleId)) return;
    pending.delete(articleId);
    if (pending.size === 0) {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              setViewportReady(true);
            }, VIEWPORT_OVERLAY_SETTLE_MS);
          });
        });
      });
    }
  }, []);

  useEffect(() => {
    if (isPending || articles.length === 0) return;
    const uris = getArticleCoverPrefetchUris(articles, ARTICLE_COVER_PREFETCH_LIMIT);
    if (uris.length === 0) return;
    void Image.prefetch(uris, { cachePolicy: "memory-disk" });
  }, [isPending, articles]);

  useEffect(() => {
    if (isPending || articles.length === 0 || viewportReady) return;
    const timeout = setTimeout(() => {
      if (viewportFailsafeTrackedKeyRef.current !== viewportGateSyncKey) {
        viewportFailsafeTrackedKeyRef.current = viewportGateSyncKey;
        trackEvent({
          eventName: "button_click",
          platform: "mobile",
          pathOrScreen: "/(main)/(tabs)/articles",
          elementId: "articles-viewport-gate-failsafe",
        });
      }
      setViewportReady(true);
    }, VIEWPORT_GATE_FAILSAFE_MS);
    return () => clearTimeout(timeout);
  }, [articles.length, isPending, viewportReady, viewportGateSyncKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const likeMutation = useMutation({
    mutationFn: (articleId: string) => articlesApi.toggleLike(articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
  });

  const handleLike = useCallback(
    (id: string) => likeMutation.mutate(id),
    [likeMutation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ArticleListDto; index: number }) => (
      <ArticleCard
        article={item}
        onLike={handleLike}
        isLikePending={likeMutation.isPending}
        listIndex={index}
        viewportGateCount={VIEWPORT_ARTICLE_COVER_GATE_COUNT}
        onViewportCoverReady={handleViewportCoverReady}
      />
    ),
    [handleLike, handleViewportCoverReady, likeMutation.isPending],
  );

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.pageTitle}>Статьи</Text>
    </View>
  );

  const showInitialLoading = !error && !refreshing && isPending;
  const showViewportLoadingOverlay =
    !error &&
    !refreshing &&
    !isPending &&
    articles.length > 0 &&
    !viewportReady;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {showInitialLoading ? (
        <Loading fullScreen message="Загрузка статей..." />
      ) : error ? (
        <View style={styles.errorContainer}>
          {listHeader}
          <Text style={styles.errorText}>
            Ошибка загрузки статей:{" "}
            {error instanceof Error ? error.message : "Неизвестная ошибка"}
          </Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.listWrap}>
          <FlashList
            data={articles}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            overrideProps={{
              estimatedItemSize: 112,
              /** Чтобы первые карточки смонтировались и отдали onDisplay обложек до снятия оверлея. */
              initialDrawBatchSize: VIEWPORT_ARTICLE_COVER_GATE_COUNT + 4,
            }}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Пока нет статей</Text>
              </View>
            }
          />
          {showViewportLoadingOverlay ? (
            <View style={styles.viewportLoadingOverlay} pointerEvents="auto">
              <Loading message="Загрузка статей..." size="large" />
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listWrap: {
    flex: 1,
    position: "relative",
  },
  viewportLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingBottom: SPACING.sm,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352E2E",
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    marginBottom: SPACING.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
    position: "relative",
  },
  cardPressed: {
    opacity: 0.9,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    gap: SPACING.md,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: "#e8e3d2",
    overflow: "hidden",
    position: "relative",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  logoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8e3d2",
  },
  logoLoadingPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8e3d2",
  },
  paidBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "rgba(40, 120, 80, 0.9)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomRightRadius: BORDER_RADIUS.sm,
  },
  paidBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    alignSelf: "flex-start",
  },
  likeButtonPressed: {
    opacity: 0.85,
  },
  likeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    fontFamily: FONTS.montserrat,
  },
  metaText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    fontFamily: FONTS.montserrat,
  },
  views: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  date: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONTS.montserrat,
    color: "#fff",
    marginBottom: SPACING.xs,
    lineHeight: 20,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  metaCol: {
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metaDot: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
  },
  likeCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  author: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  errorContainer: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.secondary,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: "center",
    fontSize: 16,
  },
});

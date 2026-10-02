import { useTabContentBottomPadding } from "@/shared/lib/useTabContentBottomPadding";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, RefreshControl, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";

import type { ArticleListDto } from "@gafus/types";

import { Button, Loading } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { articlesApi } from "@/shared/lib/api";
import { articlesQueryOptions } from "@/shared/lib/api/articlesQuery";
import { getArticleLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { COLORS, SPACING, FONTS } from "@/shared/config";

const ARTICLE_COVER_PLACEHOLDER_DELAY_MS = 140;
/** Сколько обложек префетчим в фоне (ускорение без привязки к снятию оверлея). */
const ARTICLE_COVER_PREFETCH_LIMIT = 12;
const INITIAL_ARTICLE_RENDER_BATCH_SIZE = 10;

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
  const version = updatedAt != null ? new Date(updatedAt).getTime().toString() : "no-version";
  return `${resolved}${resolved.includes("?") ? "&" : "?"}v=${version}`;
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
}

const ArticleCard = memo(function ArticleCard({
  article,
  onLike,
  isLikePending,
}: ArticleCardProps) {
  const router = useRouter();
  const rawCover = article.logoImg || article.imageUrls?.[0];
  const coverUrl = getVersionedImageUrl(rawCover, article.updatedAt);
  const coverCandidates = useMemo(() => getArticleLogoVariantCandidates(coverUrl), [coverUrl]);
  const [coverCandidateIndex, setCoverCandidateIndex] = useState(0);
  const hasNextCoverFallback = coverCandidateIndex < coverCandidates.length - 1;
  const currentCoverUrl = coverCandidates[coverCandidateIndex];
  const coverCacheKey = `article-${article.id}-${new Date(article.updatedAt).getTime()}-${coverCandidateIndex}`;
  const [isCoverLoading, setIsCoverLoading] = useState(false);
  const [showCoverPlaceholder, setShowCoverPlaceholder] = useState(false);
  const coverPlaceholderDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    coverPlaceholderDelayTimeoutRef.current = setTimeout(() => {
      setShowCoverPlaceholder(true);
    }, ARTICLE_COVER_PLACEHOLDER_DELAY_MS);
  }, [article.id, currentCoverUrl]);

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

  const handleOpenArticle = useCallback(() => {
    console.log("[rewarded-unlock] article card open detail", {
      articleId: article.id,
      slug: article.slug,
      visibility: article.visibility,
      hasAccess: article.hasAccess,
    });
    router.push(`/articles/${article.slug}` as Parameters<typeof router.push>[0]);
  }, [article.hasAccess, article.id, article.slug, article.visibility, router]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handleOpenArticle}
      accessibilityRole="button"
      accessibilityLabel={`Открыть статью «${article.title}»`}
      accessibilityHint="Открывает полный текст статьи"
    >
      <View style={styles.cardSurface}>
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
                  priority="normal"
                  transition={0}
                  accessibilityLabel={`Обложка статьи «${article.title}»`}
                  onLoadStart={() => {
                    if (coverPlaceholderDelayTimeoutRef.current) {
                      clearTimeout(coverPlaceholderDelayTimeoutRef.current);
                      coverPlaceholderDelayTimeoutRef.current = null;
                    }
                    setIsCoverLoading(true);
                    setShowCoverPlaceholder(false);
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
                  }}
                  onDisplay={() => {
                    if (coverPlaceholderDelayTimeoutRef.current) {
                      clearTimeout(coverPlaceholderDelayTimeoutRef.current);
                      coverPlaceholderDelayTimeoutRef.current = null;
                    }
                    setIsCoverLoading(false);
                    setShowCoverPlaceholder(false);
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
                      coverPlaceholderDelayTimeoutRef.current = setTimeout(() => {
                        setShowCoverPlaceholder(true);
                      }, ARTICLE_COVER_PLACEHOLDER_DELAY_MS);
                      return;
                    }
                    setIsCoverLoading(false);
                    setShowCoverPlaceholder(false);
                  }}
                />
                {isCoverLoading && showCoverPlaceholder && (
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
            <Text style={styles.title}>{article.title}</Text>
            <View style={styles.articleMeta}>
              <View style={styles.articleFact}>
                <MaterialCommunityIcons name="eye-outline" size={16} color={COLORS.primary} />
                <Text style={styles.metaText}>{formatViews(article.viewCount ?? 0)}</Text>
              </View>
              <Pressable
                style={({ pressed: p }) => [
                  styles.likeButton,
                  article.isLiked && styles.likeButtonLiked,
                  p && styles.likeButtonPressed,
                ]}
                onPress={handleLikePress}
                disabled={isLikePending}
                hitSlop={8}
                accessibilityLabel={article.isLiked ? "Убрать лайк" : "Нравится"}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLikePending }}
              >
                <MaterialCommunityIcons
                  name={article.isLiked ? "heart" : "heart-outline"}
                  size={18}
                  color={article.isLiked ? "#B74C45" : COLORS.primary}
                />
                <Text style={styles.likeButtonText}>{article.likeCount}</Text>
              </Pressable>
            </View>
            <Button
              label="Читать"
              variant="primary"
              height={40}
              fontSize={12}
              lineHeight={16}
              fontFamily={FONTS.montserratBold}
              horizontalPadding={12}
              verticalPadding={0}
              borderRadius={12}
              icon="arrow-right"
              iconPosition="right"
              animatedPress
              onPress={(event) => {
                event.stopPropagation();
                handleOpenArticle();
              }}
              accessibilityHint="Открывает полный текст статьи"
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export default function ArticlesScreen() {
  const tabContentBottomPadding = useTabContentBottomPadding();
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } = useQuery(articlesQueryOptions);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
    }, [queryClient]),
  );

  const articles = useMemo(() => data?.data ?? [], [data?.data]);

  useEffect(() => {
    if (isPending || articles.length === 0) return;
    const uris = getArticleCoverPrefetchUris(articles, ARTICLE_COVER_PREFETCH_LIMIT);
    if (uris.length === 0) return;
    void Image.prefetch(uris, { cachePolicy: "memory-disk" });
  }, [isPending, articles]);

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

  const handleLike = useCallback((id: string) => likeMutation.mutate(id), [likeMutation]);

  const renderItem = useCallback(
    ({ item }: { item: ArticleListDto }) => (
      <ArticleCard article={item} onLike={handleLike} isLikePending={likeMutation.isPending} />
    ),
    [handleLike, likeMutation.isPending],
  );

  const listHeader = (
    <View style={styles.header}>
      <Image
        source={require("../../../assets/images/articles-header.png")}
        style={styles.headerImage}
        contentFit="cover"
        accessible
        accessibilityLabel="Статьи. Полезные материалы о заботе и воспитании питомца"
      />
    </View>
  );

  if (!error && !refreshing && isPending) {
    return <Loading fullScreen message="Загрузка статей..." />;
  }

  return (
    <TexturedSafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {error ? (
        <View style={styles.errorContainer}>
          {listHeader}
          <Text style={styles.errorText}>
            Ошибка загрузки статей: {error instanceof Error ? error.message : "Неизвестная ошибка"}
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
              estimatedItemSize: 150,
              initialDrawBatchSize: INITIAL_ARTICLE_RENDER_BATCH_SIZE,
            }}
            ListHeaderComponent={listHeader}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabContentBottomPadding }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Пока нет статей</Text>
              </View>
            }
          />
        </View>
      )}
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listWrap: {
    flex: 1,
    position: "relative",
  },
  header: {
    paddingBottom: SPACING.sm,
  },
  headerImage: {
    height: 180,
    marginHorizontal: -SPACING.md,
    marginBottom: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  card: {
    borderRadius: 16,
    marginBottom: SPACING.md,
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 17,
    elevation: 5,
    position: "relative",
  },
  cardSurface: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: COLORS.cardBackground,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ translateY: 2 }, { scale: 0.988 }],
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    padding: 12,
    gap: 12,
  },
  logoBox: {
    width: 150,
    alignSelf: "stretch",
    borderRadius: 12,
    backgroundColor: "#ECE5D2",
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
    backgroundColor: "#ECE5D2",
  },
  logoLoadingPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECE5D2",
  },
  paidBadge: {
    position: "absolute",
    top: SPACING.xs,
    left: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
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
    minWidth: 48,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 9,
    backgroundColor: "#E8E1CB",
    borderRadius: 20,
  },
  likeButtonLiked: {
    backgroundColor: "#F2D8D3",
  },
  likeButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.95 }],
  },
  likeButtonText: {
    fontSize: 13,
    color: COLORS.primaryDark,
    fontFamily: FONTS.montserratBold,
  },
  metaText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#686540",
    fontFamily: FONTS.montserrat,
  },
  content: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    gap: 8,
    paddingVertical: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    lineHeight: 22,
  },
  articleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.xs,
  },
  articleFact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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

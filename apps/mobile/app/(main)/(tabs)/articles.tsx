import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, RefreshControl, Pressable, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";

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
  onOpen: (slug: string) => void;
  isLikePending: boolean;
}

const ArticleCard = memo(function ArticleCard({
  article,
  onLike,
  onOpen,
  isLikePending,
}: ArticleCardProps) {
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

  const handleOpenArticle = useCallback(() => onOpen(article.slug), [article.slug, onOpen]);

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
                disabled={isLikePending || !article.hasAccess}
                hitSlop={8}
                accessibilityLabel={article.isLiked ? "Убрать лайк" : "Нравится"}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLikePending || !article.hasAccess }}
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
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (authLoading || (authenticated && (!owner || !epoch))) {
    return <Loading fullScreen message="Загрузка статей..." />;
  }
  const scope = owner && epoch ? `${owner}:${epoch}` : "guest";
  return <ArticlesActor key={scope} owner={owner} epoch={epoch} />;
}

function ArticlesActor({ owner, epoch }: { owner: string | null; epoch: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const inRefresh = useRef(false);
  const inLike = useRef(false);
  const unknownLikes = useRef(new Set<string>());
  const confirmedLikes = useRef(new Map<string, boolean>());
  const [refreshing, setRefreshing] = useState(false);
  const [likePendingId, setLikePendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const current = useCallback(() => {
    const auth = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (!mounted.current || auth.isLoading) return false;
    if (owner && epoch) {
      return (
        auth.isAuthenticated &&
        auth.user?.id === owner &&
        binding?.principalId === owner &&
        binding.authEpoch === epoch
      );
    }
    return !auth.isAuthenticated;
  }, [owner, epoch]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const scope = owner && epoch ? `${owner}:${epoch}` : "guest";
  const { data, isPending, isError, refetch } = useQuery({
    ...articlesQueryOptions,
    queryKey: ["articles", "list", scope],
    queryFn: async () => {
      if (!current()) throw new Error("ARTICLES_ACTOR_CHANGED");
      const response = await articlesApi.getAll();
      // Do not cache a B-session list under A's existing private query key.
      if (!current()) throw new Error("ARTICLES_ACTOR_CHANGED");
      if (!response.success) throw new Error("ARTICLES_LIST_GET_FAILED");
      return response;
    },
    enabled: current(), retry: false, staleTime: 0, gcTime: 0,
  });
  const articles = useMemo(() => (isError ? [] : (data?.data ?? [])), [data?.data, isError]);
  const focusSeen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusSeen.current) {
        focusSeen.current = true;
        return;
      }
      if (current())
        void queryClient.invalidateQueries({ queryKey: ["articles", "list", scope] }).catch(() => {
          if (current())
            reportClientError(new Error("ARTICLES_FOCUS_INVALIDATION_FAILED"), {
              issueKey: "ArticlesScreen",
              keys: { operation: "focus" },
            });
        });
    }, [queryClient, current, scope]),
  );
  useEffect(() => {
    if (!current() || isPending || isError || !articles.length) return;
    const uris = getArticleCoverPrefetchUris(articles, ARTICLE_COVER_PREFETCH_LIMIT);
    if (uris.length)
      void Image.prefetch(uris, { cachePolicy: "memory-disk" }).catch(() => {
        if (current())
          reportClientError(new Error("ARTICLE_COVER_PREFETCH_FAILED"), {
            issueKey: "ArticlesScreen",
            keys: { operation: "image_prefetch" },
          });
      });
  }, [isPending, isError, articles, current]);
  useEffect(() => {
    if (!current()) return;
    for (const item of articles) {
      if (confirmedLikes.current.get(item.id) === item.isLiked)
        confirmedLikes.current.delete(item.id);
    }
  }, [articles, current]);

  const onRefresh = useCallback(async () => {
    if (inRefresh.current || !current()) return;
    inRefresh.current = true;
    setRefreshing(true);
    setNotice("");
    try {
      const result = await refetch();
      if (current() && result.isError) setNotice("Не удалось обновить статьи. Попробуйте ещё раз.");
    } catch {
      if (current()) {
        reportClientError(new Error("ARTICLES_REFETCH_FAILED"), {
          issueKey: "ArticlesScreen",
          keys: { operation: "refresh" },
        });
        setNotice("Не удалось обновить статьи. Попробуйте ещё раз.");
      }
    } finally {
      inRefresh.current = false;
      if (current()) setRefreshing(false);
    }
  }, [refetch, current]);

  const handleOpen = useCallback(
    (slug: string) => {
      if (current() && slug.trim())
        router.push(`/articles/${encodeURIComponent(slug)}` as Parameters<typeof router.push>[0]);
    },
    [current, router],
  );
  const handleLike = useCallback(
    async (id: string) => {
      if (
        !current() ||
        inLike.current ||
        unknownLikes.current.has(id) ||
        confirmedLikes.current.has(id)
      )
        return;
      if (!owner || !epoch) {
        Alert.alert("Статьи", "Чтобы поставить лайк, войдите в аккаунт.");
        return;
      }
      inLike.current = true;
      setLikePendingId(id);
      setNotice("");
      try {
        const response = await articlesApi.toggleLike(id, current);
        if (!current()) return;
        if (!response.success || !response.data || typeof response.data.isLiked !== "boolean") {
          unknownLikes.current.add(id);
          setNotice("Результат реакции неизвестен. Повторная отправка заблокирована.");
          return;
        }
        confirmedLikes.current.set(id, response.data.isLiked);
        try {
          await queryClient.invalidateQueries({ queryKey: ["articles"] });
        } catch {
          if (current()) {
            reportClientError(new Error("ARTICLE_LIKE_CACHE_FAILED"), {
              issueKey: "ArticlesScreen",
              keys: { operation: "invalidate" },
            });
            setNotice("Реакция сохранена. Обновите список для отображения.");
          }
        }
      } catch {
        if (current()) {
          unknownLikes.current.add(id);
          reportClientError(new Error("ARTICLE_LIKE_OUTCOME_UNKNOWN"), {
            issueKey: "ArticlesScreen",
            keys: { operation: "like" },
          });
          setNotice("Результат реакции неизвестен. Повторная отправка заблокирована.");
        }
      } finally {
        inLike.current = false;
        if (current()) setLikePendingId(null);
      }
    },
    [current, owner, epoch, queryClient],
  );

  const renderItem = useCallback(
    ({ item }: { item: ArticleListDto }) => (
      <ArticleCard
        article={item}
        onOpen={handleOpen}
        onLike={(id) => void handleLike(id)}
        isLikePending={
          likePendingId !== null ||
          unknownLikes.current.has(item.id) ||
          confirmedLikes.current.has(item.id)
        }
      />
    ),
    [handleOpen, handleLike, likePendingId],
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

  if (isPending) return <Loading fullScreen message="Загрузка статей..." />;
  return (
    <TexturedSafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {isError ? (
        <View style={styles.errorContainer}>
          {listHeader}
          <Text style={styles.errorText}>Не удалось загрузить статьи.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку статей"
            onPress={() => void onRefresh()}
          >
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.listWrap}>
          {!!notice && (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {notice}
            </Text>
          )}
          <FlashList
            data={articles}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            overrideProps={{
              estimatedItemSize: 150,
              initialDrawBatchSize: INITIAL_ARTICLE_RENDER_BATCH_SIZE,
            }}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
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

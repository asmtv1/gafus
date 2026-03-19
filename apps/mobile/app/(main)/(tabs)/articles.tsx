import { useState, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
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
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/constants";

function formatViews(n: number): string {
  const last = n % 10;
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 19) return `${n} просмотров`;
  if (last === 1) return `${n} просмотр`;
  if (last >= 2 && last <= 4) return `${n} просмотра`;
  return `${n} просмотров`;
}

interface ArticleCardProps {
  article: ArticleListDto;
  onLike: (articleId: string) => void;
  isLikePending: boolean;
}

const ArticleCard = memo(function ArticleCard({ article, onLike, isLikePending }: ArticleCardProps) {
  const router = useRouter();
  const rawCover = article.logoImg || article.imageUrls?.[0];
  const coverUrl = resolveImageUrl(rawCover);

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
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl, cacheKey: `article-${article.id}` }}
              style={styles.logoImage}
              contentFit="cover"
              recyclingKey={article.id}
              accessibilityLabel={`Обложка статьи «${article.title}»`}
            />
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
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const res = await articlesApi.getAll();
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки статей");
      return res;
    },
    staleTime: 30_000,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["articles"] });
    }, [queryClient]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const articles = data?.data ?? [];
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
    ({ item }: { item: ArticleListDto }) => (
      <ArticleCard
        article={item}
        onLike={handleLike}
        isLikePending={likeMutation.isPending}
      />
    ),
    [handleLike, likeMutation.isPending],
  );

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.pageTitle}>Статьи</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isLoading ? (
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
        <FlashList
          data={articles}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          overrideProps={{ estimatedItemSize: 112 }}
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    backgroundColor: "#fff",
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

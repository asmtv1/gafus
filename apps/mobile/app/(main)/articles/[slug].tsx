import { useEffect, useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import Markdown from "react-native-markdown-display";

import { getAppleProductIdForArticleId } from "@/features/payments/appleIapClientMap";
import { useIosInAppPurchase } from "@/features/payments/useIosInAppPurchase";
import { articlesApi, paymentsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { wrapArticleHtml, ARTICLE_HEIGHT_MSG, ARTICLE_READY_MSG } from "@/shared/lib/articles/wrapArticleHtml";
import { useAuthStore } from "@/shared/stores";
import { WEB_BASE } from "@/shared/lib/utils/alerts";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/constants";
import { Loading } from "@/shared/components/ui";

export default function ArticleDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: res, isLoading, error } = useQuery({
    queryKey: ["article", slug],
    queryFn: async () => {
      const r = await articlesApi.getBySlug(slug as string);
      if (!r.success) throw new Error(r.error ?? "Ошибка загрузки статьи");
      return r;
    },
    enabled: !!slug,
  });

  const toggleLikeMutation = useMutation({
    mutationFn: (articleId: string) => articlesApi.toggleLike(articleId),
    onSuccess: (res, articleId) => {
      void queryClient.invalidateQueries({ queryKey: ["article", slug] });
      const newIsLiked = res?.data?.isLiked;
      if (typeof newIsLiked !== "boolean") return;
      const delta = newIsLiked ? 1 : -1;
      queryClient.setQueryData(
        ["articles"],
        (old: { success?: boolean; data?: Array<{ id: string; likeCount: number; isLiked: boolean }> } | undefined) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((a) =>
              a.id === articleId
                ? { ...a, isLiked: newIsLiked, likeCount: Math.max(0, (a.likeCount ?? 0) + delta) }
                : a,
            ),
          };
        },
      );
    },
  });

  const article = res?.data;
  const user = useAuthStore((s) => s.user);
  const [payLoading, setPayLoading] = useState(false);
  const [htmlHeight, setHtmlHeight] = useState<number | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const { purchaseProduct, restoreAndVerifyAll, isLoading: isIapLoading } = useIosInAppPurchase();

  useEffect(() => {
    if (slug && article) {
      void articlesApi.incrementView(slug).catch((error) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "ArticleDetailScreen",
          keys: { operation: "increment_view" },
        });
      });
    }
  }, [slug, article?.id]);

  useEffect(() => {
    setHtmlHeight(null);
    setWebViewReady(false);
  }, [article?.id]);

  // Fallback: высота и ready, если postMessage не пришёл
  useEffect(() => {
    if (
      !article ||
      article.contentType === "TEXT" ||
      article.content === null ||
      htmlHeight != null
    )
      return;
    const t = setTimeout(() => {
      setHtmlHeight(800);
      setWebViewReady(true);
    }, 3500);
    return () => clearTimeout(t);
  }, [article?.id, article?.contentType, article?.content, htmlHeight]);

  // Fallback: показать WebView, если postMessage так и не пришёл (4 с)
  useEffect(() => {
    if (!article || article.contentType === "TEXT" || article.content === null) return;
    const t = setTimeout(() => setWebViewReady(true), 4000);
    return () => clearTimeout(t);
  }, [article?.id, article?.contentType, article?.content]);

  const handleLike = () => {
    if (article) toggleLikeMutation.mutate(article.id);
  };

  const handlePay = useCallback(async () => {
    if (!article) return;
    setPayError(null);
    const isIos = Platform.OS === "ios";
    if (!isIos) {
      setPayLoading(true);
    }
    try {
      if (isIos) {
        const sku = getAppleProductIdForArticleId(article.id);
        if (!sku) {
          setPayError("Покупка через App Store для этой статьи не настроена.");
          return;
        }
        const result = await purchaseProduct(sku);
        if (result.cancelled) {
          return;
        }
        if (result.success) {
          await queryClient.invalidateQueries({ queryKey: ["article", slug] });
          return;
        }
        setPayError(result.message ?? "Не удалось подтвердить покупку");
        return;
      }

      const response = await paymentsApi.createPayment({ articleId: article.id });
      if (!response.success || !response.data?.confirmationUrl) {
        setPayError(response.error ?? "Не удалось создать платёж");
        return;
      }
      void Linking.openURL(response.data.confirmationUrl);
    } finally {
      if (!isIos) {
        setPayLoading(false);
      }
    }
  }, [article?.id, purchaseProduct, queryClient, slug]);

  const handleRestoreIapArticle = useCallback(async () => {
    if (!article || Platform.OS !== "ios") return;
    setPayError(null);
    setPayLoading(true);
    try {
      const r = await restoreAndVerifyAll();
      await queryClient.invalidateQueries({ queryKey: ["article", slug] });
      if (!r.success) {
        setPayError("Не удалось восстановить покупки.");
      }
    } finally {
      setPayLoading(false);
    }
  }, [article, queryClient, restoreAndVerifyAll, slug]);

  const coverUrl = resolveImageUrl(article?.imageUrls?.[0]);

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Ошибка" }} />
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backRowText}>Назад</Text>
        </Pressable>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : "Ошибка загрузки статьи"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading || !article) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Загрузка..." }} />
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backRowText}>Назад</Text>
        </Pressable>
        <Loading fullScreen message="Загрузка статьи..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: article.title }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backRowText}>Назад</Text>
        </Pressable>

        <Text style={styles.title}>{article.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{article.authorUsername}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>
            {new Date(article.createdAt).toLocaleDateString("ru-RU")}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.likeButton, pressed && styles.likeButtonPressed]}
          onPress={handleLike}
          disabled={toggleLikeMutation.isPending}
          hitSlop={12}
          accessibilityLabel={article.isLiked ? "Убрать лайк" : "Нравится"}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={article.isLiked ? "heart" : "heart-outline"}
            size={20}
            color={article.isLiked ? "#e63946" : COLORS.textSecondary}
          />
          <Text style={[styles.likeCount, article.isLiked && styles.likeCountLiked]}>
            {article.likeCount}
          </Text>
        </Pressable>

        {coverUrl && (
          <View style={styles.coverFrame}>
            <Image
              source={{ uri: coverUrl, cacheKey: `article-${article.id}` }}
              style={styles.coverImage}
              contentFit="cover"
              accessibilityLabel={`Обложка статьи «${article.title}»`}
            />
          </View>
        )}

        {article.videoUrl && (
          <View style={styles.videoFrame}>
            <WebView
              source={{ uri: article.videoUrl }}
              style={styles.video}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
            />
          </View>
        )}

        {(article.imageUrls?.length ?? 0) > 0 && (
          <View style={styles.gallery}>
            {article.imageUrls?.map((url, i) => {
              const resolved = resolveImageUrl(url);
              if (!resolved) return null;
              return (
                <Image
                  key={url}
                  source={{ uri: resolved, cacheKey: `article-${article.id}-img-${i}` }}
                  style={styles.galleryImage}
                  contentFit="cover"
                  accessibilityLabel={`Иллюстрация ${i + 1} к статье «${article.title}»`}
                />
              );
            })}
          </View>
        )}

        {article.content === null ? (
          <View style={styles.paidBlock}>
            {article.description ? (
              <View style={styles.paidDescription}>
                <Markdown style={markdownStyles}>{article.description}</Markdown>
              </View>
            ) : null}
            <Text style={styles.paidBlockTitle}>Платная статья</Text>
            <Text style={styles.paidSubtitle}>
              Оплатите «{article.title}» для доступа к содержимому.
              {(article.priceRub ?? 0) > 0 && ` Стоимость: ${article.priceRub} ₽.`}
            </Text>
            {user ? (
              <View style={styles.paidButtonsRow}>
                {payError ? (
                  <Text style={styles.payErrorText}>{payError}</Text>
                ) : null}
                <Pressable
                  style={[
                    styles.btnPrimary,
                    (payLoading || isIapLoading) && styles.btnDisabled,
                  ]}
                  onPress={handlePay}
                  disabled={payLoading || isIapLoading}
                >
                  <Text style={styles.btnPrimaryText}>
                    {payLoading || isIapLoading
                      ? "Загрузка…"
                      : Platform.OS === "ios"
                        ? "Оплатить через App Store"
                        : "Оплатить статью"}
                  </Text>
                </Pressable>
                {Platform.OS === "ios" ? (
                  <Pressable
                    style={[styles.btnOutline, (payLoading || isIapLoading) && styles.btnDisabled]}
                    onPress={() => void handleRestoreIapArticle()}
                    disabled={payLoading || isIapLoading}
                  >
                    <Text style={styles.btnOutlineText}>Восстановить покупки</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.btnOutline}
                  onPress={() => void Linking.openURL(`${WEB_BASE}/oferta.html`)}
                >
                  <Text style={styles.btnOutlineText}>Оферта</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.btnPrimary}
                onPress={() =>
                  router.replace(
                    `/(auth)/login?returnUrl=${encodeURIComponent(`/articles/${article.slug}`)}` as Parameters<typeof router.replace>[0],
                  )
                }
              >
                <Text style={styles.btnPrimaryText}>Войти</Text>
              </Pressable>
            )}
          </View>
        ) : article.contentType === "TEXT" ? (
          <View style={styles.contentBlock}>
            <Markdown style={markdownStyles}>{article.content}</Markdown>
          </View>
        ) : (
          <View style={styles.webviewWrapper}>
            {!webViewReady && (
              <View style={[styles.webviewSpinner, { height: Dimensions.get("window").height - 100 }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            )}
            <View
              style={[
                styles.webviewContainer,
                {
                  height: Dimensions.get("window").height - 100,
                  opacity: webViewReady ? 1 : 0,
                },
              ]}
            >
              <WebView
                key={article.id}
                source={{ html: wrapArticleHtml(article.content ?? "") }}
                style={[styles.webview, { flex: 1 }]}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                originWhitelist={["*"]}
                onMessage={(e) => {
                  try {
                    const msg = JSON.parse(e.nativeEvent.data) as {
                      type?: string;
                      height?: number;
                    };
                    if (msg.type === ARTICLE_READY_MSG) {
                      setTimeout(() => setWebViewReady(true), 100);
                      if (typeof msg.height === "number" && msg.height > 0) {
                        setHtmlHeight((prev) => Math.max(prev ?? 0, msg.height!));
                      }
                    } else if (
                      msg.type === ARTICLE_HEIGHT_MSG &&
                      typeof msg.height === "number" &&
                      msg.height > 0
                    ) {
                      setHtmlHeight((prev) => Math.max(prev ?? 0, msg.height!));
                    }
                  } catch (error) {
                    reportClientError(
                      error instanceof Error ? error : new Error(String(error)),
                      {
                        issueKey: "ArticleDetailScreen",
                        keys: { operation: "parse_webview_message" },
                      },
                    );
                    /* ignore */
                  }
                }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const markdownStyles = {
  body: { color: COLORS.text, fontFamily: FONTS.montserrat, fontSize: 16 },
  heading1: { color: "#352e2e", fontFamily: FONTS.impact, fontSize: 22 },
  heading2: { color: "#352e2e", fontFamily: FONTS.impact, fontSize: 18 },
  paragraph: { marginBottom: SPACING.sm },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
    gap: 4,
  },
  backRowText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  title: {
    fontSize: 24,
    fontWeight: "400",
    fontFamily: FONTS.impact,
    color: "#352e2e",
    marginBottom: SPACING.xs,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: SPACING.md,
  },
  metaText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  metaDot: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  likeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: SPACING.md,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: 24,
    minWidth: 96,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  likeButtonPressed: {
    opacity: 0.8,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  likeCount: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  likeCountLiked: {
    color: "#e63946",
  },
  coverFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
    marginBottom: SPACING.md,
    backgroundColor: COLORS.onPrimary,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  paidBlock: {
    padding: SPACING.xxl,
    alignItems: "center",
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    width: "100%",
  },
  paidDescription: {
    width: "100%",
    marginBottom: SPACING.lg,
  },
  paidBlockTitle: {
    fontSize: 20,
    fontWeight: "600",
    fontFamily: FONTS.impact,
    color: "#352e2e",
    marginBottom: SPACING.sm,
  },
  paidSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  paidButtonsRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    justifyContent: "center",
  },
  payErrorText: {
    width: "100%",
    fontSize: 14,
    color: COLORS.error,
    fontFamily: FONTS.montserrat,
    textAlign: "center",
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.md,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: FONTS.montserrat,
  },
  btnOutline: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.md,
  },
  btnOutlineText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  contentBlock: {
    marginBottom: SPACING.md,
  },
  webviewWrapper: {
    position: "relative" as const,
    marginBottom: SPACING.md,
  },
  webviewSpinner: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    minHeight: 200,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  webviewContainer: {
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden" as const,
    backgroundColor: "#fff",
  },
  webview: {
    width: "100%",
  },
  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  galleryImage: {
    width: "48%",
    aspectRatio: 16 / 9,
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
  },
  videoFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
    marginTop: SPACING.sm,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  errorContainer: {
    flex: 1,
    padding: SPACING.md,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: COLORS.error,
    fontFamily: FONTS.montserrat,
    textAlign: "center",
  },
});

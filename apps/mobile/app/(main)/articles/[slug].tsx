import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import Markdown from "react-native-markdown-display";

import { articlesApi, paymentsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import {
  wrapArticleHtml,
  ARTICLE_HEIGHT_MSG,
  ARTICLE_READY_MSG,
  ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS,
} from "@/shared/lib/articles/wrapArticleHtml";
import { useAuthStore } from "@/shared/stores";
import { WEB_BASE } from "@/shared/lib/utils/alerts";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/constants";
import { Loading, MascotSpinner } from "@/shared/components/ui";
import { trackEvent } from "@/shared/lib/analytics";

/** Доп. высота под WebView; для HTML-статей без лишнего низа — 0. */
const ARTICLE_WEBVIEW_HEIGHT_PADDING = 0;
/** Пока нет postMessage — компактная высота для замера; не весь экран (избегаем «скролл в скролле»). */
const ARTICLE_WEBVIEW_LOADING_HEIGHT = 360;
/** Совпадает с таймаутом в useEffect ниже. */
const ARTICLE_WEBVIEW_FALLBACK_HEIGHT = 800;

export default function ArticleDetailScreen() {
  const router = useRouter();
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

  const article = res?.data;
  const user = useAuthStore((s) => s.user);
  const [payLoading, setPayLoading] = useState(false);
  const [htmlHeight, setHtmlHeight] = useState<number | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  /** Таймаут 3.5s выставил 800px — без внутреннего скролла контент длинных статей обрежется. */
  const [articleHeightIsTimeoutFallback, setArticleHeightIsTimeoutFallback] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [isReadCompleteTracked, setIsReadCompleteTracked] = useState(false);

  useEffect(() => {
    if (slug && article) {
      void articlesApi.incrementView(slug).catch((error) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "ArticleDetailScreen",
          keys: { operation: "increment_view" },
        });
      });
    }
  }, [slug, article]);

  useEffect(() => {
    setHtmlHeight(null);
    setWebViewReady(false);
    setArticleHeightIsTimeoutFallback(false);
    setIsReadCompleteTracked(false);
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
      setArticleHeightIsTimeoutFallback(true);
      setHtmlHeight(ARTICLE_WEBVIEW_FALLBACK_HEIGHT);
      setWebViewReady(true);
    }, 3500);
    return () => clearTimeout(t);
  }, [article, htmlHeight]);

  // Fallback: показать WebView, если postMessage так и не пришёл (4 с)
  useEffect(() => {
    if (!article || article.contentType === "TEXT" || article.content === null) return;
    const t = setTimeout(() => {
      setWebViewReady(true);
    }, 4000);
    return () => clearTimeout(t);
  }, [article]);

  const handlePay = useCallback(async () => {
    if (!article) return;
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: `/articles/${article.slug}`,
      elementId: "article-paid-pay-click",
    });
    setPayError(null);
    setPayLoading(true);
    try {
      const response = await paymentsApi.createPayment({ articleId: article.id });
      if (!response.success || !response.data?.confirmationUrl) {
        setPayError(response.error ?? "Не удалось создать платёж");
        return;
      }
      void Linking.openURL(response.data.confirmationUrl);
    } finally {
      setPayLoading(false);
    }
  }, [article]);

  const hasMeasuredArticleHtml =
    htmlHeight != null && htmlHeight > 0;
  const articleWebViewBlockHeight = hasMeasuredArticleHtml
    ? Math.ceil(htmlHeight) + ARTICLE_WEBVIEW_HEIGHT_PADDING
    : webViewReady
      ? ARTICLE_WEBVIEW_FALLBACK_HEIGHT
      : ARTICLE_WEBVIEW_LOADING_HEIGHT;
  const articleWebViewScrollInside =
    !hasMeasuredArticleHtml || articleHeightIsTimeoutFallback;
  const handleArticleReadProgress = useCallback(
    (offsetY: number, contentHeight: number, layoutHeight: number) => {
      if (isReadCompleteTracked || !article?.id) return;
      if (contentHeight <= 0 || layoutHeight <= 0) return;
      const progress = (offsetY + layoutHeight) / contentHeight;
      if (progress < 0.95) return;
      setIsReadCompleteTracked(true);
      trackEvent({
        eventName: "button_click",
        platform: "mobile",
        pathOrScreen: `/articles/${article.slug}`,
        elementId: "article-read-complete",
      });
    },
    [article?.id, article?.slug, isReadCompleteTracked],
  );

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

  const isHtmlArticle = article.content !== null && article.contentType !== "TEXT";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen options={{ title: article.title }} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isHtmlArticle && styles.scrollContentHtmlArticle,
        ]}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          handleArticleReadProgress(contentOffset.y, contentSize.height, layoutMeasurement.height);
        }}
        scrollEventThrottle={200}
      >
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backRowText}>Назад</Text>
        </Pressable>

        <Text style={styles.title}>{article.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {new Date(article.createdAt).toLocaleDateString("ru-RU")}
          </Text>
        </View>

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
                  style={[styles.btnPrimary, payLoading && styles.btnDisabled]}
                  onPress={handlePay}
                  disabled={payLoading}
                >
                  <Text style={styles.btnPrimaryText}>
                    {payLoading ? "Загрузка…" : "Оплатить статью"}
                  </Text>
                </Pressable>
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
          <View style={[styles.webviewWrapper, styles.webviewWrapperFlushBottom]}>
            {!webViewReady && (
              <View style={[styles.webviewSpinner, { height: articleWebViewBlockHeight }]}>
                <MascotSpinner size="large" />
              </View>
            )}
            <View
              style={[
                styles.webviewContainer,
                styles.webviewContainerFlushBottom,
                {
                  height: articleWebViewBlockHeight,
                  opacity: webViewReady ? 1 : 0,
                },
              ]}
            >
              <WebView
                key={article.id}
                source={{ html: wrapArticleHtml(article.content ?? "") }}
                style={[styles.webview, { height: articleWebViewBlockHeight }]}
                scrollEnabled={articleWebViewScrollInside}
                nestedScrollEnabled={articleWebViewScrollInside}
                originWhitelist={["*"]}
                injectedJavaScript={ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS}
                onMessage={(e) => {
                  const raw = e.nativeEvent.data;
                  try {
                    const msg = JSON.parse(raw) as {
                      type?: string;
                      height?: number;
                    };
                    if (msg.type === ARTICLE_READY_MSG) {
                      setArticleHeightIsTimeoutFallback(false);
                      setTimeout(() => setWebViewReady(true), 100);
                      if (typeof msg.height === "number" && msg.height > 0) {
                        setHtmlHeight((prev) => Math.max(prev ?? 0, msg.height!));
                      }
                    } else if (
                      msg.type === ARTICLE_HEIGHT_MSG &&
                      typeof msg.height === "number" &&
                      msg.height > 0
                    ) {
                      setArticleHeightIsTimeoutFallback(false);
                      setHtmlHeight((prev) => Math.max(prev ?? 0, msg.height!));
                      setWebViewReady(true);
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
  /** HTML-вставка: без нижнего поля ScrollView (контент сам задаёт отступ при необходимости). */
  scrollContentHtmlArticle: {
    paddingBottom: 0,
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
  webviewWrapperFlushBottom: {
    marginBottom: 0,
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
  webviewContainerFlushBottom: {
    marginBottom: 0,
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

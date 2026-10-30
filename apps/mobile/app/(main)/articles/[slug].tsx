import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Crypto from "expo-crypto";
import { gafusApi } from "@/shared/lib/api/gafus";
import { WebView } from "react-native-webview";
import Markdown from "@/features/articles/ArticleMarkdown";

import { articlesApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import {
  wrapArticleHtml,
  ARTICLE_HEIGHT_MSG,
  ARTICLE_READY_MSG,
  ARTICLE_WEBVIEW_HEIGHT_INJECTED_JS,
} from "@/shared/lib/articles/wrapArticleHtml";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { trackEvent } from "@/shared/lib/analytics";
import { openAppSubscriptionPaywall } from "@/features/app-subscription";

/** Доп. высота под WebView; для HTML-статей без лишнего низа — 0. */
const ARTICLE_WEBVIEW_HEIGHT_PADDING = 0;
/** Пока нет postMessage — компактная высота для замера; не весь экран (избегаем «скролл в скролле»). */
const ARTICLE_WEBVIEW_LOADING_HEIGHT = 360;
/** Совпадает с таймаутом в useEffect ниже. */
const ARTICLE_WEBVIEW_FALLBACK_HEIGHT = 800;

export default function ArticleDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (authLoading || (authenticated && (!owner || !epoch))) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Loading fullScreen message="Загрузка статьи..." />
      </SafeAreaView>
    );
  }
  if (typeof slug !== "string" || !slug.trim())
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <Text style={styles.errorText}>Статья не найдена.</Text>
      </SafeAreaView>
    );
  return (
    <ArticleDetailActor
      key={`${owner ?? "guest"}:${epoch ?? "public"}:${slug}`}
      slug={slug}
      owner={owner}
      epoch={epoch}
    />
  );
}
function ArticleDetailActor({
  slug,
  owner,
  epoch,
}: {
  slug: string;
  owner: string | null;
  epoch: string | null;
}) {
  const router = useRouter();
  const mounted = useRef(true);
  const current = useCallback(() => {
    if (!mounted.current) return false;
    const auth = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (auth.isLoading) return false;
    if (owner && epoch)
      return (
        auth.isAuthenticated &&
        auth.user?.id === owner &&
        binding?.principalId === owner &&
        binding.authEpoch === epoch
      );
    return !auth.isAuthenticated;
  }, [owner, epoch]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const {
    data: res,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["article", owner ?? "guest", epoch ?? "public", slug],
    queryFn: async () => {
      if (!current()) throw new Error("ARTICLE_ACTOR_CHANGED");
      const r = await articlesApi.getBySlug(slug);
      // This response might have completed after logout or an A→B switch.
      // Never place another actor's paid text in this Query cache key.
      if (!current()) throw new Error("ARTICLE_ACTOR_CHANGED");
      if (!r.success) throw new Error("ARTICLE_DETAIL_GET_FAILED");
      return r;
    },
    enabled: current(),
    // As in the Web view, never retain paid HTML/text in an unmounted query.
    // No stale entitlement reuse after returning to this screen.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  // Paid content is a *current* server entitlement, not a cached possession.
  // During background revalidation (or an auth epoch change), keep old paid
  // content and its media outside the native tree and WebView entirely.
  const article = current() && !isLoading && !isFetching && !error && res?.success
    ? res.data : null;
  const canReadArticle = article?.hasAccess === true && article.content !== null;
  const user = useAuthStore((s) => s.user);
  const attemptedViews = useRef(new Set<string>());
  const likeFlight = useRef(false);
  const unknownLike = useRef(false);
  const confirmedLike = useRef<boolean | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [likeNotice, setLikeNotice] = useState("");
  const [gafusUnlockBusy, setGafusUnlockBusy] = useState(false);
  const gafusUnlockInFlightRef = useRef(false);
  // Preserve this ID on uncertain network ACK; no double spending.
  const gafusRequestId = useRef<string | null>(null);
  const [htmlHeight, setHtmlHeight] = useState<number | null>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  /** Таймаут 3.5s выставил 800px — без внутреннего скролла контент длинных статей обрежется. */
  const [articleHeightIsTimeoutFallback, setArticleHeightIsTimeoutFallback] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [isReadCompleteTracked, setIsReadCompleteTracked] = useState(false);
  const gafusStatusQuery = useQuery({
    queryKey: ["gafus-article-status", owner ?? "guest", epoch ?? "public", article?.id ?? null],
    queryFn: () => gafusApi.status(),
    enabled: Boolean(owner && epoch && article && !canReadArticle),
    staleTime: 0,
    retry: false,
  });
  const gafusStatus = gafusStatusQuery.data;


  useEffect(() => {
    if (!current() || !article || article.slug !== slug) return;
    const key = `${owner ?? "guest"}:${epoch ?? "public"}:${slug}`;
    if (attemptedViews.current.has(key)) return;
    attemptedViews.current.add(key); // Mark BEFORE write; never replay unknown ACK.
    void articlesApi.incrementView(slug, current).then(result => {
      if (current() && !result.success)
        reportClientError(new Error("ARTICLE_VIEW_ACK_UNCONFIRMED"), {
          issueKey: "ArticleDetailScreen", keys: { operation: "increment_view" },
        });
    }).catch(() => {
      if (current()) reportClientError(new Error("ARTICLE_VIEW_RESULT_UNKNOWN"), {
        issueKey: "ArticleDetailScreen", keys: { operation: "increment_view" },
      });
    });
  }, [slug, article, owner, epoch, current]);

  const handleArticleLike = useCallback(async () => {
    if (!current() || !owner || !epoch || !article || !canReadArticle ||
        likeFlight.current || unknownLike.current ||
        (confirmedLike.current !== null && article.isLiked !== confirmedLike.current)) return;
    likeFlight.current = true;
    setLikePending(true);
    setLikeNotice("");
    try {
      const result = await articlesApi.toggleLike(article.id, current);
      if (!current()) return;
      if (!result.success || typeof result.data?.isLiked !== "boolean") {
        unknownLike.current = true;
        setLikeNotice("Результат лайка неизвестен. Повторная отправка заблокирована.");
        return;
      }
      const acknowledged = result.data.isLiked;
      confirmedLike.current = acknowledged;
      const readback = await refetch();
      if (!current()) return;
      if (readback.isError || !readback.data?.success ||
          readback.data.data?.isLiked !== acknowledged) {
        unknownLike.current = true;
        setLikeNotice("Лайк отправлен, но не подтверждён. Откройте статью заново.");
      }
    } catch {
      if (!current()) return;
      unknownLike.current = true;
      reportClientError(new Error("ARTICLE_LIKE_RESULT_UNKNOWN"), {
        issueKey: "ArticleDetailScreen", keys: { operation: "toggle_like" },
      });
      setLikeNotice("Результат лайка неизвестен. Повторная отправка заблокирована.");
    } finally {
      likeFlight.current = false;
      if (current()) setLikePending(false);
    }
  }, [article, canReadArticle, current, epoch, owner, refetch]);

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

  const handleGafusUnlock = useCallback(async () => {
    if (!current() || !owner || !epoch || !article || canReadArticle ||
      gafusUnlockInFlightRef.current || !gafusStatus?.enabled.spending ||
      !gafusStatus.enabled.economy || gafusStatus.wallet.balance < 1) return;
    gafusUnlockInFlightRef.current = true;
    setGafusUnlockBusy(true);
    setPayError(null);
    try {
      const clientRequestId = gafusRequestId.current ?? Crypto.randomUUID();
      gafusRequestId.current = clientRequestId;
      await gafusApi.unlock({ clientRequestId, target: { type: "ARTICLE", articleId: article.id } });
      const verified = await refetch();
      if (!current()) return;
      if (verified.data?.success && verified.data.data?.hasAccess === true) {
        gafusRequestId.current = null;
        setPayError(null);
      } else {
        setPayError("Доступ пока не подтверждён. Проверьте его перед повтором.");
      }
      await gafusStatusQuery.refetch();
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "ArticleDetailScreen",
        keys: { operation: "unlock_article_with_gafus" },
      });
      if (current())
        setPayError("Не удалось подтвердить покупку. Повтор выполняется только с тем же номером запроса.");
    } finally {
      gafusUnlockInFlightRef.current = false;
      if (current()) setGafusUnlockBusy(false);
    }
  }, [article, canReadArticle, current, epoch, gafusStatus, gafusStatusQuery, owner, refetch]);

  const verifyGafusAccess = useCallback(async () => {
    if (gafusUnlockInFlightRef.current || !current()) return;
    gafusUnlockInFlightRef.current = true;
    setGafusUnlockBusy(true);
    try {
      const verified = await refetch();
      if (!current()) return;
      if (verified.data?.success && verified.data.data?.hasAccess) {
        gafusRequestId.current = null;
        setPayError(null);
      } else {
        setPayError("Доступ пока не подтверждён. Нового списания не было.");
      }
    } catch {
      if (current()) setPayError("Не удалось проверить доступ. Нового списания не было.");
    } finally {
      gafusUnlockInFlightRef.current = false;
      if (current()) setGafusUnlockBusy(false);
    }
  }, [current, refetch]);

  const handleSubscriptionPaywall = useCallback(() => {
    openAppSubscriptionPaywall({ reason: "required", contentMode: "subscription" });
  }, []);

  const hasMeasuredArticleHtml = htmlHeight != null && htmlHeight > 0;
  const articleWebViewBlockHeight = hasMeasuredArticleHtml
    ? Math.ceil(htmlHeight) + ARTICLE_WEBVIEW_HEIGHT_PADDING
    : webViewReady
      ? ARTICLE_WEBVIEW_FALLBACK_HEIGHT
      : ARTICLE_WEBVIEW_LOADING_HEIGHT;
  const articleWebViewScrollInside = !hasMeasuredArticleHtml || articleHeightIsTimeoutFallback;
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
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Не удалось загрузить статью. Попробуйте ещё раз.</Text>
          <Button
            label="Повторить загрузку статьи"
            variant="primary"
            onPress={() => {
              if (!current()) return;
              void refetch().catch(() => {
                if (current())
                  reportClientError(new Error("ARTICLE_DETAIL_REFETCH_FAILED"), {
                    issueKey: "ArticleDetailScreen",
                    keys: { operation: "retry" },
                  });
              });
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading || isFetching) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Загрузка..." }} />
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <Loading fullScreen message="Загрузка статьи..." />
      </SafeAreaView>
    );
  }

  if (!article)
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppBackButton
          style={styles.backRow}
          onPress={() => {
            if (current()) router.back();
          }}
        />
        <Text style={styles.errorText}>Статья не найдена.</Text>
      </SafeAreaView>
    );

  const isHtmlArticle = canReadArticle && article.contentType !== "TEXT";

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
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />

        <Text style={styles.title}>{article.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {new Date(article.createdAt).toLocaleDateString("ru-RU")}
          </Text>
        </View>
        {canReadArticle && owner && epoch && (
          <Button
            label={article.isLiked ? "Убрать лайк" : "Нравится"}
            variant="outline" fullWidth={false}
            disabled={likePending || unknownLike.current ||
              (confirmedLike.current !== null && article.isLiked !== confirmedLike.current)}
            onPress={() => void handleArticleLike()}
          />
        )}
        {likeNotice ? <Text accessibilityRole="alert">{likeNotice}</Text> : null}

        {canReadArticle && article.videoUrl && (
          <View style={styles.videoFrame}>
            <WebView
              source={{ uri: article.videoUrl }}
              style={styles.video}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
            />
          </View>
        )}

        {canReadArticle && (article.imageUrls?.length ?? 0) > 0 && (
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

        {!canReadArticle ? (
          <View style={[styles.paidBlock, styles.rewardedPaidBlock]}>
            {article.description ? (
              <View style={styles.paidDescription}>
                <Markdown style={markdownStyles}>{article.description}</Markdown>
              </View>
            ) : null}
            {user ? (
              <View style={[styles.paidButtonsRow, styles.rewardedPaidButtonsRow]}>
                <View style={styles.gafusUnlock}>
                  <Text style={styles.gafusUnlockTitle}>Открыть статью на 7 дней</Text>
                  <Text style={styles.gafusUnlockInfo}>
                    Один гафус — одна статья. Premium открывает все статьи.
                  </Text>
                  <Text style={styles.gafusUnlockInfo}>
                    {gafusStatus
                      ? `Баланс: ${gafusStatus.wallet.balance} гафусов`
                      : "Проверяем баланс…"}
                  </Text>
                  <Button label={gafusUnlockBusy ? "Открываем…" : "Открыть за 1 гафус"}
                    variant="primary"
                    disabled={gafusUnlockBusy || !gafusStatus?.enabled.economy ||
                      !gafusStatus.enabled.spending || gafusStatus.wallet.balance < 1}
                    onPress={() => void handleGafusUnlock()} />
                  {gafusRequestId.current && <Button label="Проверить доступ"
                    variant="outline" disabled={gafusUnlockBusy}
                    onPress={() => void verifyGafusAccess()}/>}
                  {payError && <Text accessibilityRole="alert" style={styles.errorText}>{payError}</Text>}
                  <Button label="Оформить Premium" variant="outline"
                    onPress={handleSubscriptionPaywall} />
                </View>
              </View>
            ) : (
              <Button
                label="Войти"
                fullWidth={false}
                height={44}
                fontFamily={FONTS.montserrat}
                fontWeight="600"
                fontSize={16}
                lineHeight={20}
                horizontalPadding={20}
                verticalPadding={12}
                borderRadius={BORDER_RADIUS.md}
                onPress={() =>
                  router.replace(
                    `/(auth)/login?returnUrl=${encodeURIComponent(`/articles/${article.slug}`)}` as Parameters<
                      typeof router.replace
                    >[0],
                  )
                }
              />
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
                <Loading message="Загрузка статьи..." />
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
                    reportClientError(error instanceof Error ? error : new Error(String(error)), {
                      issueKey: "ArticleDetailScreen",
                      keys: { operation: "parse_webview_message" },
                    });
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
    marginBottom: SPACING.md,
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
  gafusUnlock: {
    width: "100%", gap: 12, borderRadius: 16, padding: 16,
    backgroundColor: "#F7F8F1", borderWidth: 1, borderColor: "#D9DEC8",
  },
  gafusUnlockTitle: {
    color: "#27301D", fontSize: 17, fontWeight: "700",
  },
  gafusUnlockInfo: {
    color: "#4F583D", fontSize: 14, lineHeight: 20,
  },
  rewardedPaidBlock: {
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
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
  rewardedPaidButtonsRow: {
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  payErrorText: {
    width: "100%",
    fontSize: 14,
    color: COLORS.error,
    fontFamily: FONTS.montserrat,
    textAlign: "center",
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

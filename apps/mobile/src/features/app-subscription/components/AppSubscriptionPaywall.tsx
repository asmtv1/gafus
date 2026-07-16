import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { fetchProducts, initConnection } from "expo-iap";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Text } from "react-native-paper";
import {
  appSubscriptionApi,
  type AppSubscriptionOfferDto,
  type AppSubscriptionPlanCode,
} from "../api/appSubscriptionApi";
import { rewardedAdsApi, showYandexRewardedAd } from "@/features/rewarded-ads";
import { reportClientError } from "@/shared/lib/tracer";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import {
  getYookassaLegalSuffix,
  getYookassaPaymentCaption,
  getYookassaPrimaryCta,
  formatAppSubscriptionPlanPrice,
  selectDefaultAppSubscriptionPlan,
} from "../lib/appSubscriptionPresentation";
import {
  getRewardedAccessSummary,
  getRewardedEarnText,
  getRewardedSpendText,
  getRewardedStatusMessage,
} from "../lib/rewardedPaywallCopy";
import { runAppleAppSubscriptionPurchase } from "../lib/appleAppSubscriptionPurchase";
import { yookassaAppSubscriptionPurchase } from "../lib/yookassaAppSubscriptionPurchase";
import { usePaywallStore } from "../store/paywallStore";
import { shouldTriggerRewardedTargetUnlock } from "../lib/rewardedTargetUnlock";

const STATUS_QUERY_KEY = ["app-subscription", "status"] as const;
const OFFER_QUERY_KEY = ["app-subscription", "offer"] as const;
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
const STATUS_POLL_ATTEMPTS = 8;
const STATUS_POLL_DELAY_MS = 1500;
const BENEFITS = [
  "Все курсы, тренировки и экзамены",
  "Консультации с кинологом",
  "Статьи и офлайн-материалы",
  "Документы питомца и напоминания",
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractDisplayPrice(product: unknown): string | null {
  if (!product || typeof product !== "object") return null;
  const value = (product as { displayPrice?: unknown }).displayPrice;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function pollActiveSubscription(): Promise<"active" | "pending"> {
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await appSubscriptionApi.getStatus();
    if (status.success && status.data?.hasActiveSubscription) {
      return "active";
    }
    await sleep(STATUS_POLL_DELAY_MS);
  }
  return "pending";
}

export function AppSubscriptionPaywall() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const close = usePaywallStore((s) => s.close);
  const reason = usePaywallStore((s) => s.reason);
  const rewardedTarget = usePaywallStore((s) => s.rewardedTarget);
  const explicitAccessSummary = usePaywallStore((s) => s.accessSummary);
  const onRewardedGrant = usePaywallStore((s) => s.onRewardedGrant);
  const [isPaying, setIsPaying] = useState(false);
  const [isRewardedLoading, setIsRewardedLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [rewardedMessage, setRewardedMessage] = useState<string | null>(null);
  const [lastSuccessfulOffer, setLastSuccessfulOffer] = useState<AppSubscriptionOfferDto | null>(
    null,
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState<AppSubscriptionPlanCode | null>(null);
  const autoUnlockAttemptKeyRef = useRef<string | null>(null);

  const refreshEntitlementQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["app-subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] }),
      queryClient.invalidateQueries({ queryKey: ["dailyCourse"] }),
      queryClient.invalidateQueries({ queryKey: ["rewarded-ads"] }),
    ]);
  }, [queryClient]);

  const statusQuery = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => appSubscriptionApi.getStatus(),
    staleTime: 0,
  });
  const offerQuery = useQuery({
    queryKey: OFFER_QUERY_KEY,
    queryFn: () => appSubscriptionApi.getOffer(),
    staleTime: 5 * 60_000,
  });
  const offer = offerQuery.data?.success ? offerQuery.data.data : null;
  const rewardedStatusQuery = useQuery({
    queryKey: [
      "rewarded-ads",
      "status",
      rewardedTarget?.targetType ?? null,
      rewardedTarget?.targetId ?? null,
    ],
    queryFn: () => rewardedAdsApi.getStatus(rewardedTarget ?? undefined),
    staleTime: 30_000,
  });
  const rewardedStatus =
    rewardedStatusQuery.data?.success && rewardedStatusQuery.data.data
      ? rewardedStatusQuery.data.data
      : null;
  const rewardedQueryError =
    rewardedStatusQuery.data && !rewardedStatusQuery.data.success
      ? rewardedStatusQuery.data.error
      : rewardedStatusQuery.error instanceof Error
        ? rewardedStatusQuery.error.message
        : null;
  useEffect(() => {
    if (offer) setLastSuccessfulOffer(offer);
  }, [offer]);

  const effectiveOffer = offer ?? lastSuccessfulOffer;
  const enabledPlans = useMemo(
    () => (effectiveOffer?.plans ?? []).filter((plan) => plan.enabled !== false),
    [effectiveOffer],
  );
  const defaultPlan = useMemo(() => selectDefaultAppSubscriptionPlan(enabledPlans), [enabledPlans]);
  useEffect(() => {
    if (enabledPlans.length === 0) {
      setSelectedPlanCode(null);
      return;
    }
    const selectedStillExists = enabledPlans.some((plan) => plan.code === selectedPlanCode);
    if (!selectedStillExists) {
      setSelectedPlanCode(defaultPlan?.code ?? null);
    }
  }, [defaultPlan, enabledPlans, selectedPlanCode]);
  const selectedPlan = enabledPlans.find((plan) => plan.code === selectedPlanCode) ?? defaultPlan;
  const yookassaPriceText = formatAppSubscriptionPlanPrice(selectedPlan);
  const isIos = Platform.OS === "ios";
  const canUseApple = isIos ? Boolean(selectedPlan?.appleProductId) : false;
  const canUseYookassa =
    Boolean(selectedPlan) && (isIos ? Boolean(effectiveOffer?.iosRuCardPaymentEnabled) : true);
  const appleProductId = selectedPlan?.appleProductId ?? null;
  const applePriceQuery = useQuery({
    queryKey: ["app-subscription", "apple-price", appleProductId],
    enabled: isIos && Boolean(appleProductId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (!appleProductId) return null;
      await initConnection();
      const products = await fetchProducts({ skus: [appleProductId], type: "subs" });
      return extractDisplayPrice(products?.[0]);
    },
  });
  const price = isIos ? (applePriceQuery.data ?? yookassaPriceText) : yookassaPriceText;
  const iosRuCardHint =
    isIos && canUseYookassa ? `При оплате через ЮKassa: ${yookassaPriceText}.` : null;
  const yookassaPaymentCaption = canUseYookassa
    ? getYookassaPaymentCaption()
    : "Списание и управление подпиской выполняются через App Store.";
  const yookassaPrimaryCta = getYookassaPrimaryCta();
  const useCompactLayout = height < 760 || width < 380;
  const headline = useMemo(
    () =>
      reason === "onboarding"
        ? "Откройте Gafus Premium"
        : "Подписка, которая экономит время и деньги",
    [reason],
  );
  const accessSummary = explicitAccessSummary ?? getRewardedAccessSummary(rewardedStatus);
  const rewardedTargetKey = rewardedTarget
    ? `${rewardedTarget.targetType}:${rewardedTarget.targetId}`
    : null;

  useEffect(() => {
    if (!statusQuery.data?.success || !statusQuery.data.data?.hasActiveSubscription) return;

    void (async () => {
      await refreshEntitlementQueries();
      close();
    })();
  }, [close, refreshEntitlementQueries, statusQuery.data]);

  const finishSuccessfulPayment = async () => {
    await refreshEntitlementQueries();
    close();
    Alert.alert("Premium подключён", "Premium уже активен на вашем аккаунте.");
  };

  const handleApplePay = async () => {
    if (!selectedPlan?.appleProductId || isPaying) return;
    setIsPaying(true);
    setPendingMessage(null);
    const result = await runAppleAppSubscriptionPurchase(selectedPlan.appleProductId, {
      appAccountToken: effectiveOffer?.appleAppAccountToken ?? null,
    });
    setIsPaying(false);
    if (result.ok) {
      await finishSuccessfulPayment();
      return;
    }
    if (!result.userCancelled) {
      Alert.alert("Оплата не прошла", result.message);
    }
  };

  const handleYookassaPay = async () => {
    if (isPaying || !selectedPlan) return;
    if (isDev) console.log("[AppSubscriptionPaywall] handleYookassaPay start");
    setIsPaying(true);
    setPendingMessage(null);
    const result = await yookassaAppSubscriptionPurchase(selectedPlan.code);
    if (isDev) {
      console.log("[AppSubscriptionPaywall] handleYookassaPay purchase result", result);
    }
    if (!result.ok) {
      if (result.userCancelled) {
        setPendingMessage("Проверяем статус оплаты в ЮKassa...");
        const subscriptionResult = await pollActiveSubscription();
        setIsPaying(false);
        await refreshEntitlementQueries();
        if (subscriptionResult === "active") {
          await finishSuccessfulPayment();
          return;
        }
        setPendingMessage(result.message);
        return;
      }
      setIsPaying(false);
      Alert.alert("Оплата не началась", result.message);
      return;
    }

    setPendingMessage("Проверяем оплату в ЮKassa...");
    const subscriptionResult = await pollActiveSubscription();
    if (isDev) {
      console.log("[AppSubscriptionPaywall] handleYookassaPay poll result", {
        localSubscriptionId: result.localSubscriptionId,
        subscriptionResult,
      });
    }
    setIsPaying(false);
    await refreshEntitlementQueries();
    if (subscriptionResult === "active") {
      await finishSuccessfulPayment();
      return;
    }
    setPendingMessage("Оплата ещё подтверждается. Обычно это занимает несколько секунд.");
  };

  const handleWatchRewardedAd = async () => {
    if (isRewardedLoading || !rewardedStatus?.canWatchAd) return;
    setIsRewardedLoading(true);
    setRewardedMessage(null);
    try {
      const sessionResponse = await rewardedAdsApi.createSession(rewardedTarget ?? undefined);
      if (!sessionResponse.success || !sessionResponse.data) {
        setRewardedMessage(sessionResponse.error ?? "Не удалось подготовить рекламу.");
        return;
      }
      const grantResponse = await showYandexRewardedAd(sessionResponse.data);
      if (!grantResponse) {
        setRewardedMessage("Просмотр не завершён. Кредиты начисляются только за полный просмотр.");
        return;
      }
      if (!grantResponse.success) {
        setRewardedMessage(grantResponse.error ?? "Не удалось начислить кредиты.");
        return;
      }
      setRewardedMessage(
        onRewardedGrant
          ? "Кредиты начислены. Открываем материал."
          : `Начислено кредитов: ${grantResponse.data?.grantedCredits ?? 0}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["rewarded-ads"] });
      await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
      await onRewardedGrant?.();
      if (onRewardedGrant) {
        close();
      }
    } catch (error) {
      reportClientError(error, {
        issueKey: "AppSubscriptionPaywall",
        keys: { operation: "watch_rewarded_ad" },
      });
      setRewardedMessage(error instanceof Error ? error.message : "Не удалось показать рекламу.");
    } finally {
      setIsRewardedLoading(false);
    }
  };

  useEffect(() => {
    console.log("[rewarded-unlock] paywall status", {
      rewardedTarget,
      rewardedTargetKey,
      hasUnlockCallback: Boolean(onRewardedGrant),
      walletBalance: rewardedStatus?.wallet.balance,
      walletMaxBalance: rewardedStatus?.wallet.maxBalance,
      canWatchAd: rewardedStatus?.canWatchAd,
      canWatchAdReason: rewardedStatus?.canWatchAdReason,
      target: rewardedStatus?.target,
      alreadyAttemptedForTarget: autoUnlockAttemptKeyRef.current === rewardedTargetKey,
    });

    if (
      !shouldTriggerRewardedTargetUnlock({
        hasUnlockCallback: Boolean(onRewardedGrant),
        status: rewardedStatus,
      }) ||
      !rewardedTargetKey ||
      autoUnlockAttemptKeyRef.current === rewardedTargetKey
    ) {
      return;
    }

    autoUnlockAttemptKeyRef.current = rewardedTargetKey;
    console.log("[rewarded-unlock] existing credits unlock attempt started", {
      rewardedTarget,
      rewardedTargetKey,
      target: rewardedStatus?.target,
      walletBalance: rewardedStatus?.wallet.balance,
    });
    setIsRewardedLoading(true);
    setRewardedMessage("Открываем материал за кредиты.");

    void (async () => {
      try {
        await onRewardedGrant?.();
        console.log("[rewarded-unlock] unlock callback succeeded", {
          rewardedTarget,
          rewardedTargetKey,
        });
        await queryClient.invalidateQueries({ queryKey: ["rewarded-ads"] });
        await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
        close();
      } catch (error) {
        console.log("[rewarded-unlock] unlock callback failed", {
          rewardedTarget,
          rewardedTargetKey,
          error: error instanceof Error ? error.message : String(error),
        });
        reportClientError(error, {
          issueKey: "AppSubscriptionPaywall",
          keys: { operation: "unlock_rewarded_target_with_existing_credits" },
        });
        setRewardedMessage(
          error instanceof Error ? error.message : "Не удалось открыть материал за кредиты.",
        );
      } finally {
        setIsRewardedLoading(false);
      }
    })();
  }, [close, onRewardedGrant, queryClient, rewardedStatus, rewardedTarget, rewardedTargetKey]);

  const openLegalLink = (url: string) => {
    void Linking.openURL(url);
  };
  const rewardedUnavailableText = getRewardedStatusMessage({
    isLoading: rewardedStatusQuery.isLoading,
    error: rewardedQueryError,
    status: rewardedStatus,
  });
  const canWatchRewardedAd = Boolean(rewardedStatus?.canWatchAd);

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <StatusBar hidden />
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top + 14, 58) },
            useCompactLayout && styles.contentCompact,
          ]}
          bounces={false}
        >
          <Pressable style={styles.backRow} onPress={close} hitSlop={12} accessibilityRole="button">
            <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
            <Text style={styles.backText}>Назад</Text>
          </Pressable>

          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>GAFUS PREMIUM</Text>
            </View>
          </View>

          {accessSummary ? (
            <View style={styles.accessSummary}>
              <View style={styles.accessSummaryHeader}>
                <MaterialCommunityIcons
                  name="ticket-confirmation-outline"
                  size={22}
                  color={COLORS.primary}
                />
                <Text style={styles.accessSummaryTitle}>{accessSummary.title}</Text>
              </View>
              <Text style={styles.accessSummaryText}>{accessSummary.subtitle}</Text>
            </View>
          ) : null}

          <Text
            style={[
              styles.title,
              useCompactLayout && styles.titleCompact,
              accessSummary && styles.titleSecondary,
            ]}
          >
            {accessSummary ? "Premium тоже откроет доступ" : headline}
          </Text>
          <Text style={[styles.subtitle, useCompactLayout && styles.subtitleCompact]}>
            {accessSummary
              ? "Можно оформить подписку или пополнить кредиты через рекламу ниже."
              : "Получите полный доступ к тренировкам, экзаменам, документам питомца и помощи кинолога."}
          </Text>

          {enabledPlans.length > 1 ? (
            <View style={styles.planSelector}>
              {enabledPlans.map((plan) => {
                const selected = selectedPlan?.code === plan.code;
                return (
                  <Pressable
                    key={plan.code}
                    style={[styles.planOption, selected && styles.planOptionSelected]}
                    onPress={() => setSelectedPlanCode(plan.code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.planOptionTitle, selected && styles.planOptionTitleSelected]}
                    >
                      {plan.title}
                    </Text>
                    <Text
                      style={[styles.planOptionPrice, selected && styles.planOptionPriceSelected]}
                    >
                      {formatAppSubscriptionPlanPrice(plan)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {effectiveOffer && enabledPlans.length === 0 ? (
            <Text style={styles.pendingText}>Подписка сейчас недоступна.</Text>
          ) : null}

          <View style={[styles.priceBox, useCompactLayout && styles.priceBoxCompact]}>
            <View style={styles.priceBenefitsBadge}>
              <Text style={styles.priceBenefitsBadgeText}>Вам станут доступны</Text>
            </View>
            <View style={[styles.priceBenefits, useCompactLayout && styles.priceBenefitsCompact]}>
              {BENEFITS.map((benefit) => (
                <View key={benefit} style={styles.priceBenefitRow}>
                  <View style={styles.priceBenefitIcon}>
                    <MaterialCommunityIcons name="check" size={14} color="#636128" />
                  </View>
                  <Text style={styles.priceBenefitText}>{benefit}</Text>
                </View>
              ))}
            </View>
            <View style={styles.priceHeader}>
              <Text style={[styles.price, useCompactLayout && styles.priceCompact]}>{price}</Text>
            </View>
            <Text style={styles.priceCaption}>{yookassaPaymentCaption}</Text>
            {iosRuCardHint ? <Text style={styles.priceCaption}>{iosRuCardHint}</Text> : null}
          </View>

          {pendingMessage ? <Text style={styles.pendingText}>{pendingMessage}</Text> : null}

          {canUseApple ? (
            <Pressable
              style={[styles.primaryButton, isPaying && styles.disabledButton]}
              onPress={handleApplePay}
              disabled={isPaying || offerQuery.isLoading || !selectedPlan}
            >
              {isPaying ? <ActivityIndicator color="#ECE5D2" /> : null}
              <Text style={styles.primaryButtonText}>
                {isPaying ? "Оформляем..." : "Оформить через App Store"}
              </Text>
            </Pressable>
          ) : null}

          {canUseYookassa ? (
            <Pressable
              style={[
                canUseApple ? styles.secondaryPayButton : styles.primaryButton,
                isPaying && styles.disabledButton,
              ]}
              onPress={handleYookassaPay}
              disabled={isPaying || offerQuery.isLoading || !selectedPlan}
            >
              {isPaying && !canUseApple ? <ActivityIndicator color="#ECE5D2" /> : null}
              {!isPaying ? (
                <Image
                  source={require("../../../../assets/images/sbp-logo.svg")}
                  style={styles.sbpIcon}
                  contentFit="contain"
                  accessible={false}
                />
              ) : null}
              <Text style={canUseApple ? styles.secondaryPayButtonText : styles.primaryButtonText}>
                {isPaying ? "Оформляем..." : yookassaPrimaryCta}
              </Text>
            </Pressable>
          ) : null}

          {rewardedStatus?.settings.platformEnabled && rewardedStatus.settings.paywallCtaEnabled ? (
            <View style={styles.rewardedBox}>
            <View style={styles.rewardedHeader}>
              <MaterialCommunityIcons name="play-circle-outline" size={22} color={COLORS.primary} />
              <Text style={styles.rewardedTitle}>Открыть за просмотр рекламы</Text>
            </View>
            <Text style={styles.rewardedText}>{getRewardedEarnText(rewardedStatus)}</Text>
            <Text style={styles.rewardedHint}>{getRewardedSpendText(rewardedStatus)}</Text>
            {rewardedStatus ? (
              <>
                <Text style={styles.rewardedHint}>
                  Баланс: {rewardedStatus.wallet.balance} из {rewardedStatus.wallet.maxBalance}.
                  Сегодня: {rewardedStatus.today.adsWatchedToday} из{" "}
                  {rewardedStatus.today.dailyAdLimit} просмотров рекламы.
                </Text>
              </>
            ) : null}
            {rewardedUnavailableText ? (
              <Text style={styles.rewardedUnavailable}>{rewardedUnavailableText}</Text>
            ) : null}
            {rewardedMessage ? <Text style={styles.rewardedMessage}>{rewardedMessage}</Text> : null}
            <Pressable
              style={[
                styles.rewardedButton,
                (!canWatchRewardedAd || isRewardedLoading) && styles.disabledButton,
              ]}
              onPress={() => void handleWatchRewardedAd()}
              disabled={!canWatchRewardedAd || isRewardedLoading}
            >
              {isRewardedLoading ? <ActivityIndicator color={COLORS.primary} /> : null}
              <Text style={styles.rewardedButtonText}>
                {isRewardedLoading ? "Открываем рекламу..." : "Посмотреть рекламу"}
              </Text>
            </Pressable>
            </View>
          ) : null}

          <Text style={styles.legalText}>
            Нажимая кнопку оплаты, вы принимаете{" "}
            <Text
              style={styles.legalLink}
              onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.appleEula)}
            >
              Terms of Use (Apple EULA)
            </Text>
            ,{" "}
            <Text
              style={styles.legalLink}
              onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}
            >
              Оферту
            </Text>{" "}
            и{" "}
            <Text
              style={styles.legalLink}
              onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}
            >
              Политику конфиденциальности
            </Text>
            . Подписка продлевается автоматически. При оплате через App Store списание идет через
            Apple ID, управлять подпиской и отменить автопродление можно в настройках Apple ID
            {canUseYookassa ? getYookassaLegalSuffix() : "."}
          </Text>

          {offerQuery.isLoading ? (
            <Text style={styles.muted}>Загружаем условия подписки...</Text>
          ) : null}
          {applePriceQuery.isLoading && isIos && canUseApple ? (
            <Text style={styles.muted}>Загружаем цену App Store...</Text>
          ) : null}
          {offerQuery.data && !offerQuery.data.success ? (
            <Text style={styles.errorText}>
              Не удалось загрузить условия подписки. Можно попробовать оплату ещё раз.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F0DF",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 14,
  },
  contentCompact: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 10,
  },
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backText: {
    marginLeft: 2,
    color: COLORS.primary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 18,
  },
  badge: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  badgeText: {
    fontFamily: FONTS.impact,
    color: "#C9A646",
    fontSize: 28,
    lineHeight: 32,
    textAlign: "center",
    textShadowColor: "rgba(255, 232, 152, 0.75)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  title: {
    fontFamily: FONTS.impact,
    color: "#352E2E",
    fontSize: 26,
    lineHeight: 30,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 28,
  },
  titleSecondary: {
    fontSize: 22,
    lineHeight: 26,
  },
  subtitle: {
    fontFamily: FONTS.montserrat,
    color: "#4E4743",
    fontSize: 14,
    lineHeight: 20,
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 19,
  },
  planSelector: {
    flexDirection: "row",
    gap: 10,
  },
  planOption: {
    flex: 1,
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(99, 97, 40, 0.28)",
    backgroundColor: "#FFF9EA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  planOptionSelected: {
    borderColor: "#636128",
    backgroundColor: "#E8F1DD",
  },
  planOptionTitle: {
    fontFamily: FONTS.montserratBold,
    color: "#352E2E",
    fontSize: 14,
    lineHeight: 18,
  },
  planOptionTitleSelected: {
    color: "#636128",
  },
  planOptionPrice: {
    marginTop: 4,
    fontFamily: FONTS.montserrat,
    color: "#5F5750",
    fontSize: 12,
    lineHeight: 16,
  },
  planOptionPriceSelected: {
    color: "#636128",
  },
  accessSummary: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(99, 97, 40, 0.35)",
    backgroundColor: "#FFF9EA",
    padding: 14,
    gap: 8,
  },
  accessSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  accessSummaryTitle: {
    flexShrink: 1,
    fontFamily: FONTS.impact,
    color: "#352E2E",
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
  },
  accessSummaryText: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.primary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  priceBox: {
    borderRadius: 18,
    backgroundColor: "#636128",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  priceBoxCompact: {
    paddingVertical: 13,
    gap: 10,
  },
  priceBenefits: {
    gap: 8,
    paddingBottom: 2,
  },
  priceBenefitsBadge: {
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: "rgba(246, 240, 223, 0.16)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  priceBenefitsBadgeText: {
    fontFamily: FONTS.montserratBold,
    color: "#F6F0DF",
    fontSize: 13,
    lineHeight: 18,
  },
  priceBenefitsCompact: {
    gap: 7,
  },
  priceBenefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  priceBenefitIcon: {
    width: 21,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F0DF",
  },
  priceBenefitText: {
    flex: 1,
    fontFamily: FONTS.montserratMedium,
    color: "#F6F0DF",
    fontSize: 13,
    lineHeight: 18,
  },
  trialLeadText: {
    fontFamily: FONTS.montserratBold,
    color: "#636128",
    fontSize: 14,
    lineHeight: 19,
  },
  trialLeadBadge: {
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: "#F6F0DF",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  priceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  price: {
    fontFamily: FONTS.impact,
    color: "#F6F0DF",
    fontSize: 28,
    lineHeight: 32,
  },
  priceCompact: {
    fontSize: 26,
    lineHeight: 30,
  },
  pricePill: {
    borderRadius: 999,
    backgroundColor: "rgba(246, 240, 223, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pricePillText: {
    fontFamily: FONTS.montserratMedium,
    color: "#F6F0DF",
    fontSize: 12,
  },
  priceCaption: {
    marginTop: 8,
    fontFamily: FONTS.montserrat,
    color: "#ECE5D2",
    fontSize: 12,
    lineHeight: 17,
  },
  rewardedBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.22)",
    backgroundColor: "#FFF9EA",
    padding: 14,
    gap: 8,
  },
  rewardedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rewardedTitle: {
    flex: 1,
    fontFamily: FONTS.montserratBold,
    color: "#352E2E",
    fontSize: 15,
    lineHeight: 20,
  },
  rewardedText: {
    fontFamily: FONTS.montserrat,
    color: "#4E4743",
    fontSize: 13,
    lineHeight: 19,
  },
  rewardedHint: {
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  rewardedUnavailable: {
    fontFamily: FONTS.montserratMedium,
    color: "#9B2F1C",
    fontSize: 12,
    lineHeight: 17,
  },
  rewardedMessage: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.primary,
    fontSize: 12,
    lineHeight: 17,
  },
  rewardedButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#636128",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: SPACING.md,
  },
  rewardedButtonText: {
    fontFamily: FONTS.montserratBold,
    color: "#636128",
    fontSize: 14,
  },
  pendingText: {
    borderRadius: 14,
    backgroundColor: "#E8F1DD",
    padding: SPACING.sm,
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: "#636128",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: SPACING.md,
  },
  primaryButtonText: {
    fontFamily: FONTS.impact,
    color: "#ECE5D2",
    fontSize: 18,
  },
  secondaryPayButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#636128",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: SPACING.md,
  },
  secondaryPayButtonText: {
    fontFamily: FONTS.impact,
    color: "#636128",
    fontSize: 16,
  },
  sbpIcon: {
    width: 20,
    height: 25,
  },
  disabledButton: {
    opacity: 0.62,
  },
  muted: {
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  errorText: {
    fontFamily: FONTS.montserrat,
    color: "#9B2F1C",
    fontSize: 12,
    lineHeight: 17,
  },
  legalText: {
    fontFamily: FONTS.montserrat,
    color: "#5F5750",
    fontSize: 11,
    lineHeight: 16,
  },
  legalLink: {
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
});

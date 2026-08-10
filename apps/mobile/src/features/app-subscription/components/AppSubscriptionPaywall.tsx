import { useCallback, useEffect, useMemo, useState } from "react";
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
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import {
  getYookassaPaymentCaption,
  getYookassaPrimaryCta,
  formatAppSubscriptionPlanPrice,
  selectDefaultAppSubscriptionPlan,
} from "../lib/appSubscriptionPresentation";
import { runAppleAppSubscriptionPurchase } from "../lib/appleAppSubscriptionPurchase";
import { yookassaAppSubscriptionPurchase } from "../lib/yookassaAppSubscriptionPurchase";
import { usePaywallStore } from "../store/paywallStore";

const STATUS_QUERY_KEY = ["app-subscription", "status"] as const;
const OFFER_QUERY_KEY = ["app-subscription", "offer"] as const;
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
const STATUS_POLL_ATTEMPTS = 8;
const STATUS_POLL_DELAY_MS = 1500;
const BENEFITS = [
  "Все курсы и статьи",
  "Помощь кинолога",
  "Документы и напоминания о питомце",
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
  const [isPaying, setIsPaying] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [lastSuccessfulOffer, setLastSuccessfulOffer] = useState<AppSubscriptionOfferDto | null>(
    null,
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState<AppSubscriptionPlanCode | null>(null);
  const showSubscriptionContent = true;

  const refreshEntitlementQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["app-subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] }),
      queryClient.invalidateQueries({ queryKey: ["dailyCourse"] }),
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
  const showYookassaPriceOnIos = isIos && Boolean(effectiveOffer?.iosRuCardPaymentEnabled);
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
  const price = showYookassaPriceOnIos
    ? yookassaPriceText
    : isIos
      ? (applePriceQuery.data ?? yookassaPriceText)
      : yookassaPriceText;
  const yookassaPaymentCaption = canUseYookassa
    ? getYookassaPaymentCaption()
    : "Списание и управление подпиской выполняются через App Store.";
  const yookassaPrimaryCta = getYookassaPrimaryCta();
  const useCompactLayout = height < 760 || width < 380;

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

  const openLegalLink = (url: string) => {
    void Linking.openURL(url);
  };

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

          {showSubscriptionContent && enabledPlans.length > 1 ? (
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

          {showSubscriptionContent && effectiveOffer && enabledPlans.length === 0 ? (
            <Text style={styles.pendingText}>Подписка сейчас недоступна.</Text>
          ) : null}

          {showSubscriptionContent ? (
            <View style={[styles.priceBox, useCompactLayout && styles.priceBoxCompact]}>
              <View style={styles.offerHeader}>
                <Text style={[styles.offerTitle, useCompactLayout && styles.offerTitleCompact]}>
                  Всё доступно по одной подписке
                </Text>
                <Text style={styles.offerSubtitle}>
                  Не нужно выбирать и покупать обучение по частям
                </Text>
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
              <View style={styles.savingsCard}>
                <View style={styles.savingsIcon}>
                  <MaterialCommunityIcons name="sale" size={20} color="#636128" />
                </View>
                <View style={styles.savingsCopy}>
                  <Text style={styles.savingsTitle}>Дешевле любого похожего онлайн-курса</Text>
                </View>
              </View>
              <View style={styles.priceBlock}>
                <Text selectable style={[styles.price, useCompactLayout && styles.priceCompact]}>
                  {price}
                </Text>
                <Text style={styles.priceContext}>за полный доступ</Text>
                <Text style={styles.renewalHint}>Автопродление можно отменить в любой момент</Text>
              </View>
            </View>
          ) : null}

          {showSubscriptionContent && pendingMessage ? (
            <Text style={styles.pendingText}>{pendingMessage}</Text>
          ) : null}

          {showSubscriptionContent && canUseApple ? (
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

          {showSubscriptionContent && canUseYookassa ? (
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

          {showSubscriptionContent && (canUseApple || canUseYookassa) ? (
            <View style={styles.paymentDetails}>
              <Text style={styles.priceCaption}>{yookassaPaymentCaption}</Text>
            </View>
          ) : null}

          {showSubscriptionContent ? (
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
              Apple ID, управлять подпиской и отменить автопродление можно в настройках Apple ID .
              Способ оплаты сохраняется для автопродления.
            </Text>
          ) : null}

          {showSubscriptionContent && offerQuery.isLoading ? (
            <Text style={styles.muted}>Загружаем условия подписки...</Text>
          ) : null}
          {showSubscriptionContent && applePriceQuery.isLoading && isIos && canUseApple ? (
            <Text style={styles.muted}>Загружаем цену App Store...</Text>
          ) : null}
          {showSubscriptionContent && offerQuery.data && !offerQuery.data.success ? (
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
  offerHeader: {
    gap: 5,
  },
  offerTitle: {
    fontFamily: FONTS.montserratBold,
    color: "#F6F0DF",
    fontSize: 21,
    lineHeight: 27,
  },
  offerTitleCompact: {
    fontSize: 19,
    lineHeight: 24,
  },
  offerSubtitle: {
    fontFamily: FONTS.montserrat,
    color: "#ECE5D2",
    fontSize: 13,
    lineHeight: 18,
  },
  priceBenefits: {
    gap: 8,
    paddingBottom: 2,
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
  savingsCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#F6F0DF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  savingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7DDAF",
  },
  savingsCopy: {
    flex: 1,
    gap: 2,
  },
  savingsTitle: {
    fontFamily: FONTS.montserratBold,
    color: "#636128",
    fontSize: 14,
    lineHeight: 19,
  },
  priceBlock: {
    gap: 2,
  },
  price: {
    fontFamily: FONTS.impact,
    color: "#F6F0DF",
    fontSize: 32,
    lineHeight: 36,
    fontVariant: ["tabular-nums"],
  },
  priceCompact: {
    fontSize: 29,
    lineHeight: 33,
  },
  priceContext: {
    fontFamily: FONTS.montserratMedium,
    color: "#F6F0DF",
    fontSize: 13,
    lineHeight: 18,
  },
  renewalHint: {
    marginTop: 4,
    fontFamily: FONTS.montserrat,
    color: "#DCD4BE",
    fontSize: 11,
    lineHeight: 16,
  },
  paymentDetails: {
    alignItems: "center",
    gap: 3,
  },
  priceCaption: {
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
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

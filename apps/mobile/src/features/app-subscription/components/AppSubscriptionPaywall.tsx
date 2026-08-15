import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput as PaperTextInput } from "react-native-paper";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Input } from "@/shared/components";
import {
  appSubscriptionApi,
  type AppSubscriptionOfferDto,
  type AppSubscriptionPlanOfferDto,
  type AppSubscriptionPlanCode,
  type AppSubscriptionPromoCodePreviewDto,
} from "../api/appSubscriptionApi";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import {
  formatAppSubscriptionPlanPrice,
  formatPlanPeriod,
  formatSavingsRub,
  getYookassaPaymentCaption,
  getYookassaPrimaryCta,
  selectDefaultAppSubscriptionPlan,
} from "../lib/appSubscriptionPresentation";
import {
  getPromoCodePricePresentation,
  getPromoCodeStateMessage,
  promoCodeStateFromErrorCode,
  shouldBlockYookassaStartForPromo,
  shouldShowSubscriptionPromoCode,
  type PromoCodeUiState,
} from "../lib/promoCodePresentation";
import { runAppleAppSubscriptionPurchase } from "../lib/appleAppSubscriptionPurchase";
import { yookassaAppSubscriptionPurchase } from "../lib/yookassaAppSubscriptionPurchase";
import { usePaywallStore } from "../store/paywallStore";

const STATUS_QUERY_KEY = ["app-subscription", "status"] as const;
const OFFER_QUERY_KEY = ["app-subscription", "offer"] as const;
const STATUS_POLL_ATTEMPTS = 8;
const STATUS_POLL_DELAY_MS = 1500;
const YOOKASSA_PLAN_ORDER: readonly AppSubscriptionPlanCode[] = [
  "TWO_WEEKS",
  "MONTHLY",
  "THREE_MONTHS",
];

const PLAN_BENEFITS = [
  "Курсы, экзамены и статьи",
  "Офлайн-доступ",
  "Документы и напоминания",
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractDisplayPrice(product: unknown): string | null {
  if (!product || typeof product !== "object") return null;
  const value = (product as { displayPrice?: unknown }).displayPrice;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function legacyApplePlan(offer: AppSubscriptionOfferDto | null): AppSubscriptionPlanOfferDto | null {
  return offer?.applePlan ?? offer?.plans.find((plan) => Boolean(plan.appleProductId)) ?? null;
}

async function pollActiveSubscription(): Promise<"active" | "pending"> {
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await appSubscriptionApi.getStatus();
    if (status.success && status.data?.hasActiveSubscription) return "active";
    await sleep(STATUS_POLL_DELAY_MS);
  }
  return "pending";
}

function badgeStyle(badge: AppSubscriptionPlanOfferDto["badge"]) {
  if (badge === "POPULAR") return [styles.badgeChip, styles.badgePopular] as const;
  if (badge === "MAX_SAVINGS") return [styles.badgeChip, styles.badgeSavings] as const;
  return [styles.badgeChip, styles.badgeTry] as const;
}

function badgeLabel(badge: AppSubscriptionPlanOfferDto["badge"]) {
  if (badge === "POPULAR") return "Популярный";
  if (badge === "MAX_SAVINGS") return "Максимальная экономия";
  return "Попробовать";
}

export function AppSubscriptionPaywall() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const close = usePaywallStore((state) => state.close);
  const [isPaying, setIsPaying] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [lastSuccessfulOffer, setLastSuccessfulOffer] = useState<AppSubscriptionOfferDto | null>(null);
  const [selectedYookassaPlanCode, setSelectedYookassaPlanCode] =
    useState<AppSubscriptionPlanCode | null>("MONTHLY");
  const promoInputRef = useRef<ComponentRef<typeof PaperTextInput>>(null);
  const promoInputValueRef = useRef("");
  const [hasPromoText, setHasPromoText] = useState(false);
  const [promoState, setPromoState] = useState<PromoCodeUiState>("idle");
  const [promoPreview, setPromoPreview] = useState<AppSubscriptionPromoCodePreviewDto | null>(null);
  const isIos = Platform.OS === "ios";

  const refreshEntitlementQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: OFFER_QUERY_KEY }),
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
  const yookassaPlans = useMemo(
    () =>
      (effectiveOffer?.yookassaPlans ?? effectiveOffer?.plans ?? [])
        .filter((plan) => plan.enabled)
        .slice()
        .sort(
          (left, right) =>
            YOOKASSA_PLAN_ORDER.indexOf(left.code) - YOOKASSA_PLAN_ORDER.indexOf(right.code),
        ),
    [effectiveOffer],
  );
  const defaultYookassaPlan = useMemo(
    () => selectDefaultAppSubscriptionPlan(yookassaPlans),
    [yookassaPlans],
  );
  useEffect(() => {
    if (yookassaPlans.length === 0) {
      setSelectedYookassaPlanCode(null);
      return;
    }
    if (!yookassaPlans.some((plan) => plan.code === selectedYookassaPlanCode)) {
      setSelectedYookassaPlanCode(defaultYookassaPlan?.code ?? null);
    }
  }, [defaultYookassaPlan, selectedYookassaPlanCode, yookassaPlans]);

  const selectedYookassaPlan =
    yookassaPlans.find((plan) => plan.code === selectedYookassaPlanCode) ?? defaultYookassaPlan;
  const applePlan = legacyApplePlan(effectiveOffer);
  const canUseApple = isIos && Boolean(applePlan?.appleProductId);
  const showYookassa = Boolean(effectiveOffer) && (!isIos || Boolean(effectiveOffer.iosRuCardPaymentEnabled));
  const canUseYookassa = showYookassa && Boolean(selectedYookassaPlan);
  const showPromoCode = shouldShowSubscriptionPromoCode({
    canUseYookassa,
    entryEnabled: effectiveOffer?.promoCode?.entryEnabled ?? false,
    eligible:
      (effectiveOffer?.promoCode?.eligible ?? false) &&
      Boolean(selectedYookassaPlan?.promoCodeEligible),
  });
  const appleProductId = applePlan?.appleProductId ?? null;
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
  const promoPrice = promoPreview ? getPromoCodePricePresentation(promoPreview) : null;
  const firstYookassaPaymentRub = promoPreview?.discountedPriceRub ?? selectedYookassaPlan?.yookassaPriceRub;
  const isPaymentBlocked = isPaying || offerQuery.isLoading;
  const promoHasError = !["idle", "checking", "applied"].includes(promoState);
  const compact = width < 360;

  const promoPreviewMutation = useMutation({
    mutationFn: ({ planCode, promoCode }: { planCode: AppSubscriptionPlanCode; promoCode: string }) =>
      appSubscriptionApi.previewPromoCode(planCode, promoCode),
  });
  const resetPromoPreviewMutation = promoPreviewMutation.reset;

  const resetPromoQuote = useCallback(() => {
    promoInputRef.current?.clear();
    promoInputValueRef.current = "";
    setHasPromoText(false);
    setPromoPreview(null);
    setPromoState("idle");
    resetPromoPreviewMutation();
  }, [resetPromoPreviewMutation]);

  useEffect(() => {
    resetPromoQuote();
  }, [resetPromoQuote, selectedYookassaPlanCode]);

  useEffect(() => {
    if (showPromoCode) return;
    resetPromoQuote();
  }, [resetPromoQuote, showPromoCode]);

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
    if (!appleProductId || isPaymentBlocked) return;
    setIsPaying(true);
    setPendingMessage(null);
    const result = await runAppleAppSubscriptionPurchase(appleProductId, {
      appAccountToken: effectiveOffer?.appleAppAccountToken ?? null,
    });
    setIsPaying(false);
    if (result.ok) return void finishSuccessfulPayment();
    if (!result.userCancelled) Alert.alert("Оплата не прошла", result.message);
  };

  const handlePromoChange = (text: string) => {
    promoInputValueRef.current = text;
    setHasPromoText(text.trim().length > 0);
    if (promoPreview || promoState !== "idle") {
      setPromoPreview(null);
      setPromoState("idle");
      promoPreviewMutation.reset();
    }
  };

  const handlePromoApply = async () => {
    if (!selectedYookassaPlan || isPaymentBlocked) return;
    const promoCode = promoInputValueRef.current.trim();
    if (!promoCode) return resetPromoQuote();
    setPromoPreview(null);
    setPromoState("checking");
    const result = await promoPreviewMutation.mutateAsync({
      planCode: selectedYookassaPlan.code,
      promoCode,
    });
    if (result.success && result.data) {
      setPromoPreview(result.data);
      setPromoState("applied");
      return;
    }
    setPromoState(promoCodeStateFromErrorCode(result.code));
  };

  const handleYookassaPay = async () => {
    if (isPaymentBlocked || !selectedYookassaPlan) return;
    if (shouldBlockYookassaStartForPromo({ hasPromoText, hasAppliedPreview: Boolean(promoPreview) })) {
      setPromoState("needs_apply");
      promoInputRef.current?.focus();
      return;
    }
    setIsPaying(true);
    setPendingMessage(null);
    const result = await yookassaAppSubscriptionPurchase(
      selectedYookassaPlan.code,
      promoPreview ? { code: promoPreview.code, revision: promoPreview.revision } : undefined,
    );
    if (!result.ok) {
      setIsPaying(false);
      if (result.code?.startsWith("PROMO_")) {
        setPromoPreview(null);
        setPromoState(promoCodeStateFromErrorCode(result.code));
        return;
      }
      if (!result.userCancelled) {
        Alert.alert("Оплата не началась", result.message);
        return;
      }
      setPendingMessage("Проверяем статус оплаты в ЮKassa...");
    } else {
      setPendingMessage("Проверяем оплату в ЮKassa...");
    }
    const subscriptionResult = await pollActiveSubscription();
    setIsPaying(false);
    await refreshEntitlementQueries();
    if (subscriptionResult === "active") return void finishSuccessfulPayment();
    setPendingMessage("Оплата ещё подтверждается. Обычно это занимает несколько секунд.");
  };

  const openLegalLink = (url: string) => void Linking.openURL(url);

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <StatusBar hidden />
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 14, 58) }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.contentInner}>
            <Pressable style={styles.backRow} onPress={close} hitSlop={12} accessibilityRole="button">
              <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
              <Text style={styles.backText}>Назад</Text>
            </Pressable>
            <View style={styles.header}><Text style={styles.brand}>GAFUS PREMIUM</Text></View>

            {isIos && canUseApple ? (
              <View style={styles.providerSection}>
                <Text style={styles.sectionTitle}>App Store</Text>
                <View style={styles.appleCard}>
                  <View><Text style={styles.cardTitle}>1 месяц</Text><Text style={styles.cardSubtitle}>Подписка через Apple</Text></View>
                  <Text style={styles.applePrice}>{applePriceQuery.data ?? formatAppSubscriptionPlanPrice(applePlan)}</Text>
                </View>
                <Pressable
                  style={[styles.primaryButton, isPaymentBlocked && styles.disabledButton]}
                  onPress={handleApplePay}
                  disabled={isPaymentBlocked}
                  accessibilityRole="button"
                  accessibilityLabel="Оформить Premium через App Store"
                  accessibilityState={{ disabled: isPaymentBlocked, busy: isPaying }}
                >
                  {isPaying ? <ActivityIndicator color="#F6F0DF" /> : null}
                  <Text style={styles.primaryButtonText}>{isPaying ? "Оформляем..." : "Оформить через App Store"}</Text>
                </Pressable>
                <Text style={styles.providerCaption}>Списание и управление подпиской выполняются через App Store.</Text>
              </View>
            ) : null}

            {showYookassa ? (
              <View style={styles.providerSection}>
                <Text style={styles.sectionTitle}>Подписка через ЮKassa</Text>
                <Text style={styles.sectionLead}>Выберите срок доступа. Оплата и продление — через СБП.</Text>
                {yookassaPlans.length > 0 ? (
                  <View accessibilityRole="radiogroup" accessibilityLabel="Тариф ЮKassa" style={styles.plansList}>
                    {yookassaPlans.map((plan) => {
                      const selected = selectedYookassaPlan?.code === plan.code;
                      const savings = formatSavingsRub(plan.savingsRub);
                      return (
                        <Pressable
                          key={plan.code}
                          style={[styles.planCard, selected && styles.planCardSelected]}
                          onPress={() => setSelectedYookassaPlanCode(plan.code)}
                          disabled={isPaying}
                          accessibilityRole="radio"
                          accessibilityState={{ selected, checked: selected, disabled: isPaying }}
                        >
                          <View style={styles.planTopRow}>
                            <View style={styles.planTitleBlock}>
                              <Text style={styles.cardTitle}>{plan.label}</Text>
                              <Text style={styles.cardSubtitle}>{formatPlanPeriod(plan.intervalDays)}</Text>
                            </View>
                            <View style={styles.planPriceBlock}>
                              {plan.badge ? <View style={badgeStyle(plan.badge)}><Text style={[styles.badgeChipText, plan.badge === "TRY" && styles.badgeTryText]}>{badgeLabel(plan.badge)}</Text></View> : null}
                              <Text style={styles.planPrice}>{formatAppSubscriptionPlanPrice(plan)}</Text>
                              {savings ? <Text style={styles.savingsText}>{savings}</Text> : null}
                            </View>
                          </View>
                          <View style={styles.selectedRow}>
                            <MaterialCommunityIcons name={selected ? "radiobox-marked" : "radiobox-blank"} size={20} color="#636128" />
                            <Text style={styles.selectedLabel}>{selected ? "Выбрано" : "Выбрать тариф"}</Text>
                          </View>
                          <View style={styles.benefits}>
                            {PLAN_BENEFITS.map((benefit) => <BenefitRow key={benefit} label={benefit} included />)}
                            <BenefitRow label="Запись к кинологу" included={plan.consultationBookingIncluded} />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : <Text style={styles.pendingText}>Подписка через ЮKassa сейчас недоступна.</Text>}

                {showPromoCode ? (
                  <View style={[styles.promoCard, promoState === "applied" && styles.promoCardApplied]} accessibilityLabel="Промокод для первого платежа через ЮKassa">
                    <View style={styles.promoHeadingRow}>
                      <View style={styles.promoHeadingCopy}>
                        <Text style={styles.promoTitle}>Промокод</Text>
                        <Text style={styles.promoSubtitle}>Скидка действует только на первый платёж</Text>
                      </View>
                      {promoPrice ? <View style={styles.promoChip}><Text style={styles.promoChipText}>{promoPrice.discount}</Text></View> : null}
                    </View>
                    <Input
                      ref={promoInputRef}
                      defaultValue=""
                      label="Промокод"
                      placeholder="Например, GAFUS"
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="done"
                      maxLength={64}
                      disabled={isPaymentBlocked || promoPreviewMutation.isPending}
                      onChangeText={handlePromoChange}
                      onSubmitEditing={() => void handlePromoApply()}
                      accessibilityLabel="Введите промокод"
                      style={styles.promoInput}
                    />
                    <Pressable
                      style={[styles.promoApplyButton, (!hasPromoText || isPaymentBlocked) && styles.disabledButton]}
                      onPress={() => void handlePromoApply()}
                      disabled={!hasPromoText || isPaymentBlocked}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !hasPromoText || isPaymentBlocked, busy: promoPreviewMutation.isPending }}
                    >
                      {promoPreviewMutation.isPending ? <ActivityIndicator size="small" color="#F6F0DF" /> : null}
                      <Text style={styles.promoApplyButtonText}>{promoPreviewMutation.isPending ? "Проверяем…" : "Применить"}</Text>
                    </Pressable>
                    {promoPrice ? (
                      <View style={styles.promoPriceBlock} accessible accessibilityLabel={`${promoPrice.firstCharge}. ${promoPrice.nextCharge}. ${promoPrice.renewal}`}>
                        <Text style={styles.promoDiscountedPrice}>{promoPrice.firstCharge}</Text>
                        <Text style={styles.promoRenewal}>{promoPrice.nextCharge}</Text>
                        <Text style={styles.promoRenewal}>{promoPrice.renewal}</Text>
                        <Text style={styles.promoLegal}>{promoPrice.legal}</Text>
                      </View>
                    ) : null}
                    {getPromoCodeStateMessage(promoState) ? <Text style={[styles.promoMessage, promoHasError && styles.promoErrorMessage]} accessibilityRole={promoHasError ? "alert" : "text"}>{getPromoCodeStateMessage(promoState)}</Text> : null}
                  </View>
                ) : null}

                {canUseYookassa ? (
                  <Pressable
                    style={[styles.primaryButton, isPaymentBlocked && styles.disabledButton]}
                    onPress={handleYookassaPay}
                    disabled={isPaymentBlocked}
                    accessibilityRole="button"
                    accessibilityLabel={getYookassaPrimaryCta(firstYookassaPaymentRub)}
                    accessibilityState={{ disabled: isPaymentBlocked, busy: isPaying }}
                  >
                    {isPaying ? <ActivityIndicator color="#F6F0DF" /> : <Image source={require("../../../../assets/images/sbp-logo.svg")} style={styles.sbpIcon} contentFit="contain" accessible={false} />}
                    <Text style={styles.primaryButtonText}>{isPaying ? "Оформляем..." : getYookassaPrimaryCta(firstYookassaPaymentRub)}</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.providerCaption}>{getYookassaPaymentCaption()}</Text>
                <Text style={styles.legalText}>
                  Нажимая кнопку оплаты, вы принимаете <Text style={styles.legalLink} onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}>Оферту</Text> и <Text style={styles.legalLink} onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>Политику конфиденциальности</Text>. Подписка продлевается автоматически; способ оплаты сохраняется в ЮKassa для продления.
                </Text>
              </View>
            ) : null}

            {isIos && canUseApple ? <Text style={styles.legalText}>Оформляя подписку, вы принимаете <Text style={styles.legalLink} onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.appleEula)}>Terms of Use (Apple EULA)</Text>, <Text style={styles.legalLink} onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}>Оферту</Text> и <Text style={styles.legalLink} onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>Политику конфиденциальности</Text>.</Text> : null}
            {pendingMessage ? <Text style={styles.pendingText}>{pendingMessage}</Text> : null}
            {offerQuery.isLoading ? <Text style={styles.muted}>Загружаем условия подписки...</Text> : null}
            {offerQuery.data && !offerQuery.data.success ? <Text style={styles.errorText} accessibilityRole="alert">Не удалось загрузить условия подписки. Попробуйте ещё раз.</Text> : null}
            {compact ? null : <View style={styles.bottomSpacer} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function BenefitRow({ label, included }: { label: string; included: boolean }) {
  return (
    <View style={styles.benefitRow}>
      <MaterialCommunityIcons name={included ? "check-circle" : "close-circle-outline"} size={18} color={included ? "#636128" : "#8E6256"} />
      <Text style={[styles.benefitText, !included && styles.benefitTextUnavailable]}>{label}{included ? "" : " — недоступно"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F0DF" },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 24 },
  contentInner: { width: "100%", maxWidth: 640, alignSelf: "center", gap: 14 },
  backRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 18 },
  header: { alignItems: "center", paddingVertical: 4 },
  brand: { color: "#C9A646", fontFamily: FONTS.impact, fontSize: 28, lineHeight: 33 },
  providerSection: { gap: 10 },
  sectionTitle: { color: "#352E2E", fontFamily: FONTS.montserratBold, fontSize: 21, lineHeight: 27 },
  sectionLead: { color: "#5F5750", fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19 },
  plansList: { gap: 10 },
  planCard: { borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(99, 97, 40, 0.28)", backgroundColor: "#FFF9EA", padding: 15, gap: 11 },
  planCardSelected: { borderWidth: 2.5, borderColor: "#636128", backgroundColor: "#EDF0DB" },
  planTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  planTitleBlock: { flex: 1, gap: 2 },
  planPriceBlock: { alignItems: "flex-end", gap: 3, maxWidth: "58%" },
  cardTitle: { color: "#352E2E", fontFamily: FONTS.montserratBold, fontSize: 18, lineHeight: 23 },
  cardSubtitle: { color: "#756D65", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 17 },
  planPrice: { color: "#352E2E", fontFamily: FONTS.impact, fontSize: 23, lineHeight: 27, fontVariant: ["tabular-nums"] },
  badgeChip: { borderRadius: 12, minHeight: 25, paddingHorizontal: 9, justifyContent: "center" },
  badgeTry: { borderWidth: 1.25, borderColor: "#636128", backgroundColor: "transparent" },
  badgePopular: { backgroundColor: "#636128" },
  badgeSavings: { backgroundColor: "#C9A646" },
  badgeChipText: { color: "#FFF9EA", fontFamily: FONTS.montserratBold, fontSize: 11, lineHeight: 15 },
  badgeTryText: { color: "#636128" },
  savingsText: { color: "#636128", fontFamily: FONTS.montserratBold, fontSize: 12, lineHeight: 16 },
  selectedRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  selectedLabel: { color: "#636128", fontFamily: FONTS.montserratMedium, fontSize: 12 },
  benefits: { borderTopColor: "rgba(99, 97, 40, 0.18)", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { color: "#352E2E", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 18 },
  benefitTextUnavailable: { color: "#8E6256" },
  appleCard: { borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(99, 97, 40, 0.28)", backgroundColor: "#FFF9EA", padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  applePrice: { color: "#352E2E", fontFamily: FONTS.impact, fontSize: 20, textAlign: "right" },
  primaryButton: { minHeight: 56, borderRadius: 20, backgroundColor: "#636128", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, paddingHorizontal: SPACING.md },
  primaryButtonText: { color: "#F6F0DF", fontFamily: FONTS.impact, fontSize: 17, textAlign: "center" },
  disabledButton: { opacity: 0.58 },
  providerCaption: { color: "#5F5750", fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16, textAlign: "center" },
  promoCard: { borderRadius: 18, borderWidth: 1.5, borderColor: "rgba(99, 97, 40, 0.42)", backgroundColor: "#FFF9EA", padding: SPACING.md, gap: 10 },
  promoCardApplied: { borderColor: "#636128", backgroundColor: "#EDF0DB" },
  promoHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  promoHeadingCopy: { flex: 1, gap: 2 },
  promoTitle: { color: COLORS.text, fontFamily: FONTS.montserratBold, fontSize: 17 },
  promoSubtitle: { color: COLORS.textSecondary, fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16 },
  promoChip: { minHeight: 30, borderRadius: 15, paddingHorizontal: 10, justifyContent: "center", backgroundColor: "#636128" },
  promoChipText: { color: "#F6F0DF", fontFamily: FONTS.montserratBold, fontSize: 13 },
  promoInput: { minHeight: 56, fontFamily: FONTS.montserratMedium, backgroundColor: "#FFFDF5" },
  promoApplyButton: { minHeight: 47, borderRadius: 14, paddingHorizontal: SPACING.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#636128" },
  promoApplyButtonText: { color: "#F6F0DF", fontFamily: FONTS.montserratBold, fontSize: 14 },
  promoPriceBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(99, 97, 40, 0.34)", paddingTop: 10, gap: 4 },
  promoDiscountedPrice: { color: "#636128", fontFamily: FONTS.impact, fontSize: 22, lineHeight: 27, fontVariant: ["tabular-nums"] },
  promoRenewal: { color: COLORS.textSecondary, fontFamily: FONTS.montserratMedium, fontSize: 12, lineHeight: 18 },
  promoLegal: { color: COLORS.textSecondary, fontFamily: FONTS.montserrat, fontSize: 10, lineHeight: 15, marginTop: 2 },
  promoMessage: { color: COLORS.textSecondary, fontFamily: FONTS.montserratMedium, fontSize: 12, lineHeight: 17 },
  promoErrorMessage: { color: "#9B2F1C" },
  sbpIcon: { width: 20, height: 25 },
  legalText: { color: "#5F5750", fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16 },
  legalLink: { color: COLORS.primary, textDecorationLine: "underline" },
  pendingText: { borderRadius: 14, backgroundColor: "#E8F1DD", padding: SPACING.sm, color: COLORS.primary, fontFamily: FONTS.montserrat, lineHeight: 20 },
  muted: { color: COLORS.textSecondary, fontFamily: FONTS.montserrat, fontSize: 13 },
  errorText: { color: "#9B2F1C", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 17 },
  bottomSpacer: { height: 8 },
});

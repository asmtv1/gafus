import { useEffect, useMemo, useState } from "react";
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
import { fetchProducts, initConnection } from "expo-iap";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Text } from "react-native-paper";
import { appSubscriptionApi, type AppSubscriptionOfferDto } from "../api/appSubscriptionApi";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import { runAppleAppSubscriptionPurchase } from "../lib/appleAppSubscriptionPurchase";
import { yookassaAppSubscriptionPurchase } from "../lib/yookassaAppSubscriptionPurchase";
import { usePaywallStore } from "../store/paywallStore";

const STATUS_QUERY_KEY = ["app-subscription", "status"] as const;
const OFFER_QUERY_KEY = ["app-subscription", "offer"] as const;
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

function formatPrice(price?: number | null) {
  if (!price) return "—";
  return `${price.toLocaleString("ru-RU")} ₽/неделю`;
}

function extractDisplayPrice(product: unknown): string | null {
  if (!product || typeof product !== "object") return null;
  const value = (product as { displayPrice?: unknown }).displayPrice;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function pollActiveSubscription() {
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    const status = await appSubscriptionApi.getStatus();
    if (status.success && status.data?.hasActiveSubscription) {
      return true;
    }
    await sleep(STATUS_POLL_DELAY_MS);
  }
  return false;
}

export function AppSubscriptionPaywall() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const close = usePaywallStore((s) => s.close);
  const reason = usePaywallStore((s) => s.reason);
  const [isPaying, setIsPaying] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [lastSuccessfulOffer, setLastSuccessfulOffer] = useState<AppSubscriptionOfferDto | null>(
    null,
  );

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
  const yookassaPriceText = formatPrice(effectiveOffer?.yookassaPriceRub);
  const isIos = Platform.OS === "ios";
  const canUseApple = isIos ? Boolean(effectiveOffer?.appleProductId) : false;
  const canUseYookassa = isIos ? Boolean(effectiveOffer?.iosRuCardPaymentEnabled) : true;
  const appleProductId = effectiveOffer?.appleProductId ?? null;
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
    isIos && canUseYookassa ? `При оплате картой РФ: ${yookassaPriceText}.` : null;
  const useCompactLayout = height < 760 || width < 380;
  const headline = useMemo(
    () =>
      reason === "onboarding"
        ? "Откройте Gafus Premium"
        : "Подписка, которая экономит время и деньги",
    [reason],
  );

  const finishSuccessfulPayment = async () => {
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
    close();
    Alert.alert("Пробный период подключён", "Premium уже активен на вашем аккаунте.");
  };

  const handleApplePay = async () => {
    if (!effectiveOffer?.appleProductId || isPaying) return;
    setIsPaying(true);
    setPendingMessage(null);
    const result = await runAppleAppSubscriptionPurchase(effectiveOffer.appleProductId);
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
    if (isPaying) return;
    setIsPaying(true);
    setPendingMessage(null);
    const result = await yookassaAppSubscriptionPurchase();
    if (!result.ok) {
      setIsPaying(false);
      Alert.alert("Привязка карты не началась", result.message);
      return;
    }

    setPendingMessage("Проверяем привязку карты в ЮKassa...");
    const isActive = await pollActiveSubscription();
    setIsPaying(false);
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
    if (isActive) {
      await finishSuccessfulPayment();
      return;
    }
    setPendingMessage("Привязка карты ещё подтверждается. Обычно это занимает несколько секунд.");
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

          <Text style={[styles.title, useCompactLayout && styles.titleCompact]}>{headline}</Text>
          <Text style={[styles.subtitle, useCompactLayout && styles.subtitleCompact]}>
            Получите полный доступ к тренировкам, экзаменам, документам питомца и помощи кинолога.
          </Text>

          <View style={[styles.priceBox, useCompactLayout && styles.priceBoxCompact]}>
            <View style={styles.priceHeader}>
              <Text style={[styles.price, useCompactLayout && styles.priceCompact]}>{price}</Text>
              <View style={styles.pricePill}>
                <Text style={styles.pricePillText}>3 дня бесплатно</Text>
              </View>
            </View>
            <Text style={styles.priceCaption}>
              Карта привязывается сейчас без списания. Первое списание — через 3 дня.
            </Text>
            {iosRuCardHint ? <Text style={styles.priceCaption}>{iosRuCardHint}</Text> : null}
          </View>

          {pendingMessage ? <Text style={styles.pendingText}>{pendingMessage}</Text> : null}

          {canUseApple ? (
            <Pressable
              style={[styles.primaryButton, isPaying && styles.disabledButton]}
              onPress={handleApplePay}
              disabled={isPaying || offerQuery.isLoading}
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
              disabled={isPaying || offerQuery.isLoading}
            >
              {isPaying && !canUseApple ? <ActivityIndicator color="#ECE5D2" /> : null}
              <Text
                style={canUseApple ? styles.secondaryPayButtonText : styles.primaryButtonText}
              >
                {isPaying ? "Оформляем..." : "Попробовать 3 дня бесплатно"}
              </Text>
              {!isPaying && canUseApple ? (
                <Text style={styles.secondaryPayButtonHint}>(только для карт РФ)</Text>
              ) : null}
            </Pressable>
          ) : null}

          <View style={[styles.benefits, useCompactLayout && styles.benefitsCompact]}>
            {BENEFITS.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <MaterialCommunityIcons name="check" size={15} color="#F6F0DF" />
                </View>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

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
            </Text>
            {" "}и{" "}
            <Text
              style={styles.legalLink}
              onPress={() => openLegalLink(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}
            >
              Политику конфиденциальности
            </Text>
            . Подписка продлевается автоматически. При оплате через App Store списание идет через
            Apple ID, управлять подпиской и отменить автопродление можно в настройках Apple ID
            {canUseYookassa
              ? "; при оплате картой РФ способ оплаты сохраняется в ЮKassa, первые 3 дня бесплатны."
              : "."}
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
  priceBox: {
    borderRadius: 18,
    backgroundColor: "#636128",
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  priceBoxCompact: {
    paddingVertical: 13,
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
  benefits: {
    borderTopWidth: 1,
    borderTopColor: "rgba(99, 97, 40, 0.18)",
    paddingTop: 4,
    gap: 8,
  },
  benefitsCompact: {
    gap: 7,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  benefitIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#636128",
  },
  benefitText: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    color: "#352E2E",
    fontSize: 14,
    lineHeight: 20,
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
    paddingHorizontal: SPACING.md,
  },
  secondaryPayButtonText: {
    fontFamily: FONTS.impact,
    color: "#636128",
    fontSize: 16,
  },
  secondaryPayButtonHint: {
    marginTop: 2,
    fontFamily: FONTS.montserratMedium,
    color: "#636128",
    fontSize: 12,
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

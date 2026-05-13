import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS, FONTS, SPACING } from "@/constants";
import { Text } from "react-native-paper";
import { appSubscriptionApi } from "../api/appSubscriptionApi";
import { runAppleAppSubscriptionPurchase } from "../lib/appleAppSubscriptionPurchase";
import { yookassaAppSubscriptionPurchase } from "../lib/yookassaAppSubscriptionPurchase";
import { usePaywallStore } from "../store/paywallStore";

const STATUS_QUERY_KEY = ["app-subscription", "status"] as const;
const OFFER_QUERY_KEY = ["app-subscription", "offer"] as const;
const STATUS_POLL_ATTEMPTS = 8;
const STATUS_POLL_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPrice(price?: number | null) {
  if (!price) return "200 ₽/неделю";
  return `${price.toLocaleString("ru-RU")} ₽/неделю`;
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
  const queryClient = useQueryClient();
  const close = usePaywallStore((s) => s.close);
  const reason = usePaywallStore((s) => s.reason);
  const [isPaying, setIsPaying] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const offerQuery = useQuery({
    queryKey: OFFER_QUERY_KEY,
    queryFn: () => appSubscriptionApi.getOffer(),
    staleTime: 5 * 60_000,
  });
  const offer = offerQuery.data?.data;
  const price = formatPrice(offer?.yookassaPriceRub);
  const canUseApple = Platform.OS === "ios" && Boolean(offer?.appleProductId);
  const canUseYookassa = Platform.OS !== "ios" || Boolean(offer?.iosRuCardPaymentEnabled);
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
    Alert.alert("Спасибо за подписку", "Premium уже активен на вашем аккаунте.");
  };

  const handleApplePay = async () => {
    if (!offer?.appleProductId || isPaying) return;
    setIsPaying(true);
    setPendingMessage(null);
    const result = await runAppleAppSubscriptionPurchase(offer.appleProductId);
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
      Alert.alert("Оплата не началась", result.message);
      return;
    }

    setPendingMessage("Проверяем оплату в ЮKassa...");
    const isActive = await pollActiveSubscription();
    setIsPaying(false);
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ["app-subscription"] });
    if (isActive) {
      await finishSuccessfulPayment();
      return;
    }
    setPendingMessage("Оплата ещё подтверждается. Обычно это занимает несколько секунд.");
  };

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.card}>
            <Pressable style={styles.closeButton} onPress={close} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color="#352E2E" />
            </Pressable>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>GAFUS PREMIUM</Text>
            </View>
            <Text style={styles.title}>{headline}</Text>
            <Text style={styles.subtitle}>
              Получите полный доступ к тренировкам, экзаменам, документам питомца и помощи кинолога.
            </Text>

            <View style={styles.priceBox}>
              <Text style={styles.price}>{price}</Text>
              <Text style={styles.priceCaption}>
                Автопродление можно отключить в профиле в любой момент.
              </Text>
            </View>

            <View style={styles.benefits}>
              {[
                "Все курсы, тренировки и экзамены без ограничений",
                "Консультации с кинологом и разбор сложных ситуаций",
                "Статьи, офлайн-материалы и профилактика",
                "Документы питомца и напоминания в одном месте",
              ].map((benefit) => (
                <View key={benefit} style={styles.benefitRow}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#636128" />
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
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
                style={[styles.secondaryPayButton, isPaying && styles.disabledButton]}
                onPress={handleYookassaPay}
                disabled={isPaying || offerQuery.isLoading}
              >
                <Text style={styles.secondaryPayButtonText}>
                  {canUseApple ? "Оплатить картой" : "Оформить подписку"}
                </Text>
              </Pressable>
            ) : null}

            <Text style={styles.legalText}>
              Нажимая кнопку оплаты, вы принимаете{" "}
              <Text
                style={styles.legalLink}
                onPress={() => void Linking.openURL("https://gafus.ru/oferta.html")}
              >
                Оферту
              </Text>
              . Подписка продлевается автоматически; при оплате картой способ оплаты сохраняется
              в ЮKassa, автопродление можно отключить в профиле.
            </Text>

            {offerQuery.isLoading ? (
              <Text style={styles.muted}>Загружаем условия подписки...</Text>
            ) : null}
            {offerQuery.data && !offerQuery.data.success ? (
              <Text style={styles.errorText}>
                {offerQuery.data.error ?? "Не удалось загрузить условия."}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#D8D2BF",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: SPACING.lg,
  },
  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "#A9A77A",
    backgroundColor: "#F6F0DF",
    padding: SPACING.lg,
    gap: SPACING.md,
    shadowColor: "#352E2E",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  closeButton: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.64)",
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#E1E8C9",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    fontFamily: FONTS.impact,
    color: COLORS.primary,
    fontSize: 13,
    letterSpacing: 1,
  },
  title: {
    fontFamily: FONTS.impact,
    color: "#352E2E",
    fontSize: 34,
    lineHeight: 38,
    maxWidth: 520,
  },
  subtitle: {
    fontFamily: FONTS.montserrat,
    color: "#4E4743",
    fontSize: 16,
    lineHeight: 24,
  },
  priceBox: {
    borderRadius: 20,
    backgroundColor: "#636128",
    padding: SPACING.md,
  },
  price: {
    fontFamily: FONTS.impact,
    color: "#F6F0DF",
    fontSize: 30,
    lineHeight: 34,
  },
  priceCaption: {
    marginTop: 6,
    fontFamily: FONTS.montserrat,
    color: "#ECE5D2",
    fontSize: 13,
    lineHeight: 18,
  },
  benefits: {
    gap: 10,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  benefitText: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    color: "#352E2E",
    fontSize: 15,
    lineHeight: 21,
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
    minHeight: 54,
    borderRadius: 18,
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
    fontSize: 17,
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
    fontSize: 13,
  },
  legalText: {
    fontFamily: FONTS.montserrat,
    color: "#5F5750",
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
});

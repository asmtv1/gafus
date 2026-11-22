/**
 * iOS Premium paywall. This platform entrypoint must not import the Android/Web
 * checkout, YooKassa start, promo preview, or feature-flagged payment UI.
 * Metro resolves this instead of AppSubscriptionPaywall.tsx for iOS.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, ScrollView, useWindowDimensions, View } from "react-native";
import { fetchProducts, getAvailablePurchases, initConnection, restorePurchases } from "expo-iap";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "react-native-paper";

import { FONTS } from "@/shared/config";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import { appSubscriptionAppleApi } from "../api/appSubscriptionAppleApi";
import type { AppSubscriptionPlanOfferDto } from "../api/appSubscriptionApi";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import { createAppleTokenInitializationAdapter } from "../lib/appleTokenInitializationAdapter";
import { runAppleAppSubscriptionPurchase } from "../lib/appleAppSubscriptionPurchase";
import { OptionalCardCheckout } from "./OptionalCardCheckout";
import {
  PREMIUM_PLAN_BENEFITS,
  PREMIUM_OFFLINE_BENEFIT,
  Premium172BenefitRow,
  premium172Styles as styles,
  premiumPlanIncludesOffline,
} from "./Premium172Appearance";
import { usePaywallStore } from "../store/paywallStore";

function getApplePlan(offer: { applePlan: AppSubscriptionPlanOfferDto | null } | null) {
  // Apple offers are independent of the YooKassa monthly plan availability.
  return offer?.applePlan?.enabled ? offer.applePlan : null;
}

function getPrice(product: unknown): string | null {
  if (!product || typeof product !== "object") return null;
  const price = (product as { displayPrice?: unknown }).displayPrice;
  return typeof price === "string" && price.trim() ? price.trim() : null;
}

const INIT_ERRORS: Record<string, string> = {
  SESSION_CHANGED: "Аккаунт изменился. Откройте подписку заново.",
  ALREADY_IN_PROGRESS: "Операция уже выполняется.",
  SNAPSHOT_UNAVAILABLE: "Не удалось проверить подписку. Попробуйте позже.",
  INITIALIZATION_NOT_APPROVED: "Инициализация Apple-подписки недоступна.",
  INITIALIZATION_FAILED: "Не удалось подготовить покупку в App Store.",
  TOKEN_INVALID: "Неверные данные Apple-подписки. Попробуйте позже.",
  READBACK_UNVERIFIED: "Проверка аккаунта не завершена. Повторите позднее.",
  PURCHASE_UNKNOWN: "Результат покупки неизвестен. Проверьте статус подписки перед повтором.",
};

export function AppSubscriptionPaywall() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const close = usePaywallStore((s) => s.close);
  const ownerId = useAuthStore((s) => s.user?.id ?? null);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const authEpoch = binding?.principalId === ownerId ? binding.authEpoch : null;
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const attempt = useRef(0);
  const inFlight = useRef(false);

  const sameOwner = useCallback(() => {
    const current = newOnlyV2NativeQueues.getVerifiedBinding();
    return Boolean(ownerId && authEpoch &&
      useAuthStore.getState().user?.id === ownerId &&
      current?.principalId === ownerId && current?.authEpoch === authEpoch);
  }, [ownerId, authEpoch]);

  useEffect(() => {
    attempt.current += 1;
    inFlight.current = false;
    setBusy(false);
    setPendingMessage(null);
  }, [ownerId, authEpoch]);

  const offerQuery = useQuery({
    queryKey: ["app-subscription", "offer", ownerId, authEpoch],
    enabled: Boolean(authEpoch),
    queryFn: () => appSubscriptionAppleApi.getOffer(sameOwner),
    staleTime: 0,
  });
  const statusQuery = useQuery({
    queryKey: ["app-subscription", "status", ownerId, authEpoch],
    enabled: Boolean(authEpoch),
    queryFn: () => appSubscriptionAppleApi.getStatus(sameOwner),
    staleTime: 0,
  });
  const offer = offerQuery.data?.success ? offerQuery.data.data ?? null : null;
  const applePlan = getApplePlan(offer);
  const productId = applePlan?.appleProductId ?? null;
  const productQuery = useQuery({
    queryKey: ["app-subscription", "apple-product", ownerId, authEpoch, productId],
    enabled: Boolean(authEpoch && productId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!productId || !sameOwner()) return null;
      await initConnection();
      if (!sameOwner()) return null;
      const products = await fetchProducts({ skus: [productId], type: "subs" });
      if (!sameOwner()) return null;
      return getPrice(products?.find((p) => p.id === productId));
    },
  });

  const refresh = useCallback(async () => {
    if (!sameOwner()) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app-subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] }),
      queryClient.invalidateQueries({ queryKey: ["dailyCourse"] }),
    ]);
  }, [queryClient, sameOwner]);

  const withLock = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current || !sameOwner()) return;
    inFlight.current = true;
    const id = ++attempt.current;
    setBusy(true);
    setPendingMessage(null);
    try { await action(); }
    catch {
      if (sameOwner()) setPendingMessage("Не удалось завершить операцию. Проверьте статус подписки.");
    } finally {
      if (id === attempt.current) {
        inFlight.current = false;
        if (sameOwner()) setBusy(false);
      }
    }
  }, [sameOwner]);

  const handlePurchase = () => void withLock(async () => {
    if (!productId || !productQuery.data || !ownerId || !authEpoch || !sameOwner()) return;
    const actor = { ownerId, authEpoch };
    const adapter = createAppleTokenInitializationAdapter({
      currentActor: () => sameOwner() ? actor : null,
      fetchSnapshot: async () => {
        const response = await appSubscriptionAppleApi.getOffer(sameOwner);
        if (!sameOwner() || !response.success || !response.data)
          return { success: false as const, code: "OFFER_UNAVAILABLE" };
        return { success: true as const, data: { appleAppAccountToken: response.data.appleAppAccountToken } };
      },
      initializeToken: async () => {
        const response = await appSubscriptionAppleApi.initializeAppleAppAccountToken(sameOwner);
        if (!sameOwner() || !response.success || !response.data?.appleAppAccountToken)
          return { success: false as const, code: "INIT_UNAVAILABLE" };
        return { success: true as const, data: { appleAppAccountToken: response.data.appleAppAccountToken } };
      },
      purchase: ({ productId: sku, appAccountToken, isCurrentAccount }) =>
        runAppleAppSubscriptionPurchase(sku, { appAccountToken, isCurrentAccount }),
    });
    const initialized = await adapter.begin(productId);
    if (!sameOwner()) return;
    if (!initialized.ok) {
      setPendingMessage(INIT_ERRORS[initialized.reason] ?? "Не удалось оформить подписку.");
      return;
    }
    if (!initialized.value.ok) {
      if (!initialized.value.userCancelled)
        setPendingMessage(initialized.value.message);
      return;
    }
    const status = await appSubscriptionAppleApi.getStatus(sameOwner);
    if (!sameOwner()) return;
    await refresh();
    if (status.success && status.data?.hasActiveSubscription) {
      close();
      Alert.alert("Premium подключён", "Покупка подтверждена на вашем аккаунте.");
    } else {
      setPendingMessage("App Store подтвердил покупку. Ожидаем обновления доступа на сервере.");
    }
  });

  const handleRestore = () => void withLock(async () => {
    if (!productId || !sameOwner()) return;
    await initConnection();
    if (!sameOwner()) return;
    // StoreKit 2 can have a previously owned subscription missing from the
    // current local transaction snapshot (reinstall / another device).
    // expo-iap restorePurchases() syncs with the App Store before querying.
    await restorePurchases();
    if (!sameOwner()) return;
    const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    if (!sameOwner()) return;
    const token = purchases.find((purchase) =>
      purchase.productId === productId && typeof purchase.purchaseToken === "string" &&
      purchase.purchaseToken.trim().length > 0,
    )?.purchaseToken?.trim();
    if (!token) {
      setPendingMessage("Не удалось найти активную покупку App Store для восстановления.");
      return;
    }
    const result = await appSubscriptionAppleApi.restoreAppleSubscription(
      { signedTransactionInfo: token }, sameOwner,
    );
    if (!sameOwner()) return;
    if (!result.success || !result.data?.success) {
      setPendingMessage("Не удалось восстановить подписку для этого аккаунта.");
      return;
    }
    await refresh();
    setPendingMessage("Покупка подтверждена. Доступ обновляется.");
  });

  const handleCancelExisting = () => void withLock(async () => {
    const result = await appSubscriptionAppleApi.cancelExistingYookassaRenewal(sameOwner);
    if (!sameOwner()) return;
    if (!result.success) {
      setPendingMessage("Не удалось отключить продление. Попробуйте позже.");
      return;
    }
    await refresh();
    setPendingMessage("Автопродление отключено. Оплаченный период сохранён.");
  });

  const status = statusQuery.data?.success ? statusQuery.data.data : null;
  const canPurchase = Boolean(sameOwner() && applePlan && productId && productQuery.data && !busy);

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <StatusBar hidden />
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 14, 58) }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contentInner}>
            <AppBackButton style={styles.backRow} onPress={close} />
            <View style={styles.header}>
              <Text style={styles.brand}>GAFUS PREMIUM</Text>
            </View>

            {status?.hasActiveSubscription ? (
              <View style={styles.providerSection}>
                <Text style={styles.sectionTitle}>Premium активен</Text>
                <View style={styles.appleCard}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.cardTitle}>У вас есть Premium</Text>
                    {status.activeUntil ? (
                      <Text style={styles.cardSubtitle}>
                        Доступ до {new Date(status.activeUntil).toLocaleDateString("ru-RU")}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {status.provider === "YOOKASSA" && !status.cancelAtPeriodEnd ? (
                  <Button
                    label="Отключить автопродление"
                    height={56} fontFamily={FONTS.impact} fontWeight="400"
                    fontSize={17} lineHeight={22} verticalPadding={0}
                    borderRadius={20} animatedPress
                    onPress={handleCancelExisting} disabled={busy}
                  />
                ) : null}
                {status.provider === "APPLE" ? (
                  <Button
                    label="Управлять в App Store" height={56}
                    fontFamily={FONTS.impact} fontWeight="400"
                    fontSize={17} lineHeight={22} verticalPadding={0}
                    borderRadius={20} animatedPress
                    onPress={() => void Linking.openURL("https://apps.apple.com/account/subscriptions")}
                  />
                ) : null}
              </View>
            ) : (
              <>
                {ownerId && authEpoch ? (
                  <OptionalCardCheckout
                    key={ownerId + authEpoch}
                    ownerKey={ownerId + authEpoch}
                    sameOwner={sameOwner}
                    busy={busy}
                    withLock={withLock}
                    refresh={refresh}
                    report={setPendingMessage}
                  />
                ) : null}

                {applePlan ? (
                  <View style={styles.providerSection}>
                    <Text style={styles.sectionTitle}>App Store</Text>
                    <View style={styles.appleCard}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.cardTitle}>1 месяц</Text>
                        <Text style={styles.cardSubtitle}>Подписка через Apple</Text>
                      </View>
                      <Text style={styles.applePrice}>
                        {productQuery.data ?? (productQuery.isLoading ? "Получаем цену…" : "Цена недоступна")}
                      </Text>
                    </View>
                    <View style={styles.appleBenefits}>
                      {PREMIUM_PLAN_BENEFITS.map((benefit) => (
                        <Premium172BenefitRow key={benefit} label={benefit} included />
                      ))}
                      <Premium172BenefitRow
                        label={PREMIUM_OFFLINE_BENEFIT}
                        included={premiumPlanIncludesOffline(applePlan)}
                      />
                      <Premium172BenefitRow
                        label="Чат с кинологом"
                        included={Boolean(applePlan.cynologistChatIncluded)}
                      />
                      <Premium172BenefitRow
                        label="Запись к кинологу"
                        included={Boolean(applePlan.consultationBookingIncluded)}
                      />
                    </View>
                    <Button
                      label={busy ? "Проверяем покупку…" : "Оформить через App Store"}
                      height={56} fontFamily={FONTS.impact} fontWeight="400"
                      fontSize={17} lineHeight={22} verticalPadding={0}
                      borderRadius={20} animatedPress
                      onPress={handlePurchase}
                      disabled={!canPurchase}
                      loading={busy}
                      accessibilityLabel="Оформить Premium через App Store"
                    />
                    <Text style={styles.providerCaption}>
                      Списание и управление подпиской выполняются через App Store.
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            <Button
              label="Восстановить покупки"
              height={52} fontFamily={FONTS.montserratBold}
              onPress={handleRestore}
              disabled={busy || !productId || !sameOwner()}
            />
            <Text style={styles.legalText}>
              Оформляя подписку, вы принимаете{ " "}
              <Text style={styles.legalLink} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.appleEula)}>
                Terms of Use (Apple EULA)
              </Text>,{ " "}
              <Text style={styles.legalLink} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}>
                Оферту
              </Text>{ " "}и{ " "}
              <Text style={styles.legalLink} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>
                Политику конфиденциальности
              </Text>.
            </Text>
            {pendingMessage ? (
              <Text style={styles.pendingText} accessibilityRole="alert">{pendingMessage}</Text>
            ) : null}
            {offerQuery.isLoading ? (
              <Text style={styles.muted}>Загружаем условия подписки...</Text>
            ) : null}
            {offerQuery.isError || (offerQuery.data && !offerQuery.data.success) ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                Не удалось загрузить условия подписки. Попробуйте позже.
              </Text>
            ) : null}
            {width >= 360 ? <View style={styles.bottomSpacer} /> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

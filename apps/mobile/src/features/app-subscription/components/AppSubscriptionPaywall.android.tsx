import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorCode, getAvailablePurchases, initConnection, purchaseErrorListener, purchaseUpdatedListener, requestPurchase, type Purchase } from "expo-iap";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { FONTS } from "@/shared/config";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import { appSubscriptionGoogleApi } from "../api/appSubscriptionGoogleApi";
import { appSubscriptionApi } from "../api/appSubscriptionApi";
import { isGooglePlayPaymentPending, isOtherProviderPaymentPending } from "../lib/googlePlayPaywallState";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import { loadGooglePlayOffers } from "../lib/googlePlayOffers";
import { selectGooglePlayPurchaseTokens } from "../lib/googlePlayPurchaseTokens";
import { usePaywallStore } from "../store/paywallStore";
import { OptionalCardCheckout } from "./OptionalCardCheckout";

type AuthEpoch = NonNullable<ReturnType<typeof newOnlyV2NativeQueues.getVerifiedBinding>>["authEpoch"];

export function AppSubscriptionPaywall() {
  const ownerId = useAuthStore((state) => state.user?.id);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const authEpoch = binding?.principalId === ownerId ? binding?.authEpoch : undefined;
  return <GooglePlayPaywall key={JSON.stringify([ownerId, authEpoch])} ownerId={ownerId} authEpoch={authEpoch} />;
}

function GooglePlayPaywall({ ownerId, authEpoch }: { ownerId?: string; authEpoch?: AuthEpoch }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const close = usePaywallStore((state) => state.close);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = useRef(false);
  const dispatched = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const sameOwner = useCallback(() => {
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return Boolean(mounted.current && ownerId && authEpoch && useAuthStore.getState().user?.id === ownerId &&
      binding?.principalId === ownerId && binding?.authEpoch === authEpoch);
  }, [ownerId, authEpoch]);

  const statusQuery = useQuery({
    queryKey: ["app-subscription", "status", ownerId, authEpoch],
    enabled: Boolean(authEpoch),
    queryFn: () => appSubscriptionGoogleApi.getStatus(sameOwner),
    refetchInterval: (query) => isGooglePlayPaymentPending(query.state.data?.data, pending) ? 15_000 : false,
  });
  const catalog = useQuery({
    queryKey: ["app-subscription", "google-catalog", ownerId, authEpoch],
    enabled: Boolean(authEpoch),
    retry: false,
    queryFn: async () => {
      const response = await appSubscriptionGoogleApi.prepare(sameOwner);
      if (!response.success || !response.data || !sameOwner()) throw new Error("GOOGLE_PLAY_PREPARE");
      return response.data;
    },
  });
  const store = useQuery({
    queryKey: ["app-subscription", "google-store", ownerId, authEpoch, catalog.data?.plans],
    enabled: Boolean(catalog.data),
    queryFn: () => loadGooglePlayOffers(catalog.data?.plans ?? []),
    retry: false,
  });
  // Only feature metadata is read from the shared subscription offer.
  // All prices, periods and purchase tokens come exclusively from Google Play.
  const benefitsQuery = useQuery({
    queryKey: ["app-subscription", "google-benefits", ownerId, authEpoch],
    enabled: Boolean(authEpoch),
    queryFn: () => appSubscriptionApi.getOffer(sameOwner),
    staleTime: 5 * 60_000,
  });
  const premiumBenefits = benefitsQuery.data?.success
    ? (benefitsQuery.data.data?.yookassaPlans ?? benefitsQuery.data.data?.plans ?? [])
      .find((plan) => plan.code === "THREE_MONTHS")
    : null;

  const refresh = useCallback(async () => {
    if (!sameOwner()) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app-subscription", "status"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] }),
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] }),
      queryClient.invalidateQueries({ queryKey: ["dailyCourse"] }),
    ]);
  }, [queryClient, sameOwner]);

  const withLock = useCallback(async (action: () => Promise<void>) => {
    if (!sameOwner() || locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch {
      if (sameOwner()) setMessage("Не удалось выполнить операцию. Проверьте статус покупки и повторите позже.");
    } finally {
      locked.current = false;
      if (sameOwner()) setBusy(false);
    }
  }, [sameOwner]);

  const verify = useCallback(async (items: Purchase[], restoring: boolean) => {
    const tokens = selectGooglePlayPurchaseTokens(
      items, catalog.data?.plans ?? [], catalog.data?.accountId ?? "",
    );
    let entitled = false;
    let pending = false;
    let failed = false;
    for (const token of tokens) {
      if (!sameOwner()) return;
      const response = await appSubscriptionGoogleApi.verify(token, sameOwner);
      entitled ||= response.data?.entitled === true;
      pending ||= response.data?.pending === true;
      failed ||= !response.success;
    }
    if (!sameOwner()) return;
    if (entitled || pending) await refresh();
    if (!sameOwner()) return;
    setPending(pending && !entitled);
    setMessage(entitled ? "Premium активен." : pending ? "Google Play ожидает завершения платежа." :
      failed || !restoring ? "Покупка пока не подтверждена. Попробуйте восстановить её позже." :
        "Покупок для восстановления не найдено.");
  }, [catalog.data, refresh, sameOwner]);

  useEffect(() => {
    const updates = purchaseUpdatedListener((purchase) => {
      if (!sameOwner() || (!dispatched.current && !pending)) return;
      dispatched.current = false;
      setWaiting(false);
      void withLock(() => verify([purchase], false));
    });
    const errors = purchaseErrorListener((error) => {
      if (!sameOwner() || !dispatched.current) return;
      dispatched.current = false;
      setWaiting(false);
      if (error.code !== ErrorCode.UserCancelled) setMessage("Google Play не завершил покупку.");
    });
    return () => { updates.remove(); errors.remove(); };
  }, [pending, verify, sameOwner, withLock]);

  const offers = store.data ?? [];
  const loadError = catalog.isError || store.isError;
  const selected = offers[0];
  async function buy() {
    if (!selected || !catalog.data || !sameOwner() || dispatched.current || locked.current) return;
    dispatched.current = true;
    setWaiting(true);
    setMessage(null);
    try {
      await requestPurchase({
        type: "subs",
        request: { google: {
          skus: [selected.productId],
          obfuscatedAccountId: catalog.data.accountId,
          subscriptionOffers: [{ sku: selected.productId, offerToken: selected.offerToken }],
        } },
      });
    } catch (error) {
      if (!dispatched.current || !sameOwner()) return;
      dispatched.current = false;
      setWaiting(false);
      if ((error as { code?: string })?.code !== ErrorCode.UserCancelled) setMessage("Не удалось открыть Google Play.");
    }
  }

  const status = statusQuery.data?.success ? statusQuery.data.data : null;
  const active = status?.hasActiveSubscription === true;
  const controlsBusy = busy || waiting;
  const hasPendingPayment = isGooglePlayPaymentPending(status, pending);
  const otherPendingPayment = isOtherProviderPaymentPending(status);
  useEffect(() => {
    if (pending && status && status.status !== "PENDING") {
      setPending(false);
      setMessage(null);
    }
  }, [pending, status]);
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <StatusBar hidden />
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 14, 58) }]}>
          <View style={styles.inner}>
            <AppBackButton onPress={close} />
            <View style={styles.header}>
              <Text style={styles.brand}>GAFUS PREMIUM</Text>
            </View>
            {active ? (
              <View style={styles.planCard}>
                <Text style={styles.sectionTitle}>Premium активен</Text>
                {status?.activeUntil ? <Text style={styles.cardSubtitle}>Доступ до {new Date(status.activeUntil).toLocaleDateString("ru-RU")}</Text> : null}
                {status?.provider === "YOOKASSA" && !status.cancelAtPeriodEnd ? (
                  <Button label="Отключить автопродление" disabled={controlsBusy} onPress={() => void withLock(async () => {
                    const result = await appSubscriptionGoogleApi.cancelExistingYookassaRenewal(sameOwner);
                    if (!result.success) throw new Error("CANCEL_RENEWAL");
                    await refresh();
                  })} />
                ) : null}
              </View>
            ) : (
              <View style={styles.providerSection}>
                <Text style={styles.sectionTitle}>Подписка через Google Play</Text>
                <View style={[styles.planCard, styles.planCardSelected]}>
                  <View style={styles.planTopRow}>
                    <View style={styles.planTitleBlock}>
                      <Text style={styles.cardTitle}>Полное сопровождение</Text>
                      <Text style={styles.cardSubtitle}>{selected?.period ?? "1 мес."} · автопродление</Text>
                    </View>
                    <View style={styles.badgeChip}>
                      <Text style={styles.badgeChipText}>Premium</Text>
                    </View>
                  </View>
                  <Text style={styles.planPrice}>{selected?.price ?? "—"}</Text>
                  <View style={styles.selectedRow}>
                    <MaterialCommunityIcons name="radiobox-marked" size={23} color="#636128" />
                    <Text style={styles.selectedLabel}>Ваш тариф</Text>
                  </View>
                  <View style={styles.benefits}>
                    <BenefitRow label="Курсы, экзамены и статьи" included />
                    <BenefitRow label="Документы и напоминания" included />
                    <BenefitRow label="Скачивание курсов для офлайн-работы"
                      included={premiumBenefits?.offlineCourseDownloadIncluded ?? true} />
                    {premiumBenefits ? (
                      <>
                        <BenefitRow label="Чат с кинологом" included={Boolean(premiumBenefits.cynologistChatIncluded)} />
                        <BenefitRow label="Запись к кинологу" included={premiumBenefits.consultationBookingIncluded} />
                      </>
                    ) : (
                      <Text style={styles.cardSubtitle}>Уточняем доступность консультаций с кинологом…</Text>
                    )}
                  </View>
                </View>
                {catalog.isFetching || store.isFetching ? (
                  <Text style={styles.muted}>Загружаем актуальную цену Google Play…</Text>
                ) : null}
                {loadError || (!catalog.isFetching && !store.isFetching && !offers.length) ? (
                  <View style={styles.notice}>
                    <Text style={styles.errorText} accessibilityRole="alert">
                      {loadError ? "Не удалось загрузить тариф из Google Play."
                        : "Google Play не вернул доступное предложение для этого аккаунта или страны."}
                    </Text>
                    <Button label="Повторить загрузку" disabled={controlsBusy}
                      onPress={() => void (catalog.isError || !catalog.data
                        ? catalog.refetch()
                        : store.refetch())} />
                  </View>
                ) : null}
                {otherPendingPayment ? (
                  <Text style={styles.noticeText} accessibilityRole="alert">
                    У вас есть незавершённая оплата другим способом. Перед новой покупкой убедитесь, что деньги по ней не списались.
                  </Text>
                ) : null}
                {hasPendingPayment ? (
                  <Text style={styles.noticeText} accessibilityRole="alert">
                    Google Play ещё подтверждает предыдущую покупку. Повторная оплата временно недоступна.
                  </Text>
                ) : null}
                {statusQuery.isError || (!status && !statusQuery.isFetching) ? (
                  <View style={styles.notice}>
                    <Text style={styles.errorText} accessibilityRole="alert">
                      Не удалось проверить статус подписки.
                    </Text>
                    <Button label="Проверить статус" onPress={() => void statusQuery.refetch()} />
                  </View>
                ) : null}
                <Button
                  label="Оформить через Google Play"
                  disabled={controlsBusy || hasPendingPayment || !selected || !status || !sameOwner()}
                  onPress={() => void buy()}
                />
                {selected ? (
                  <Text style={styles.providerCaption}>
                    {selected.price} за {selected.period}. Подписка автоматически продлевается,
                    пока вы её не отмените. Оплата и отмена — через Google Play.
                  </Text>
                ) : null}
              </View>
            )}
            {ownerId && authEpoch && status && !active && !hasPendingPayment ? <OptionalCardCheckout
              ownerKey={ownerId + authEpoch} sameOwner={sameOwner} busy={controlsBusy}
              withLock={withLock} refresh={refresh} report={setMessage} /> : null}
            <View style={styles.secondaryActions}>
              <Button label="Восстановить покупки" disabled={busy || !catalog.data || !sameOwner()}
                onPress={() => {
                  dispatched.current = false;
                  setWaiting(false);
                  void withLock(async () => {
                    if (!await initConnection() || !sameOwner()) throw new Error("GOOGLE_PLAY_CONNECTION");
                    await verify(await getAvailablePurchases(), true);
                  });
                }} />
              <Button label="Управлять в Google Play" onPress={() => void Linking.openURL(
                "https://play.google.com/store/account/subscriptions?package=ru.gafus.app",
              ).catch(() => setMessage("Не удалось открыть Google Play."))} />
            </View>
            <View style={styles.legalLinks}>
              <Text style={styles.legal} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}>
                Условия использования и оплаты
              </Text>
              <Text style={styles.legal} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>
                Политика конфиденциальности
              </Text>
            </View>
            {message ? <Text style={styles.noticeText} accessibilityRole="alert">{message}</Text> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function BenefitRow({ label, included }: { label: string; included: boolean }) {
  return (
    <View style={styles.benefitRow}>
      <MaterialCommunityIcons
        name={included ? "check-circle" : "close-circle-outline"}
        size={19}
        color={included ? "#636128" : "#8E6256"}
      />
      <Text style={[styles.benefitText, !included && styles.benefitTextUnavailable]}>
        {label}{included ? "" : " — недоступно"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F0DF" },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 28 },
  inner: { width: "100%", maxWidth: 640, alignSelf: "center", gap: 14 },
  header: { alignItems: "center", paddingVertical: 4 },
  brand: { fontFamily: FONTS.impact, fontSize: 28, lineHeight: 33, color: "#C9A646", textAlign: "center" },
  providerSection: { gap: 12 },
  sectionTitle: { fontFamily: FONTS.montserratBold, fontSize: 21, lineHeight: 27, color: "#352E2E" },
  planCard: {
    backgroundColor: "#FFFDF5", borderRadius: 24, borderCurve: "continuous",
    borderWidth: 1, borderColor: "rgba(99, 97, 40, 0.10)", borderTopColor: "rgba(255, 255, 255, 0.96)",
    padding: 18, gap: 14, boxShadow: "0 8px 14px rgba(53, 52, 16, 0.24)", elevation: 7,
  },
  planCardSelected: {
    borderWidth: 2, borderColor: "#636128", borderTopColor: "#D6AF43", backgroundColor: "#F0F3DF",
    boxShadow: "0 10px 18px rgba(53, 52, 16, 0.30)", elevation: 9,
  },
  planTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  planTitleBlock: { flex: 1, gap: 3 },
  cardTitle: { color: "#352E2E", fontFamily: FONTS.montserratBold, fontSize: 21, lineHeight: 27 },
  cardSubtitle: { color: "#756D65", fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19 },
  planPrice: { color: "#352E2E", fontFamily: FONTS.impact, fontSize: 30, lineHeight: 35, fontVariant: ["tabular-nums"] },
  badgeChip: { borderRadius: 15, paddingHorizontal: 12, minHeight: 30, justifyContent: "center", backgroundColor: "#636128" },
  badgeChipText: { color: "#FFF9EA", fontFamily: FONTS.montserratBold, fontSize: 11 },
  selectedRow: {
    alignSelf: "flex-start", minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7,
    borderRadius: 19, paddingHorizontal: 9, backgroundColor: "rgba(99, 97, 40, 0.12)",
  },
  selectedLabel: { color: "#636128", fontFamily: FONTS.montserratMedium, fontSize: 13 },
  benefits: { borderTopColor: "rgba(99, 97, 40, 0.14)", borderTopWidth: 1, paddingTop: 13, gap: 9 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { color: "#352E2E", fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19, flexShrink: 1 },
  benefitTextUnavailable: { color: "#8E6256" },
  providerCaption: { color: "#756D65", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 18 },
  muted: { color: "#756D65", fontFamily: FONTS.montserrat, fontSize: 13 },
  notice: { gap: 9 },
  noticeText: { color: "#756D65", fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19 },
  errorText: { color: "#9B483B", fontFamily: FONTS.montserratMedium, fontSize: 13, lineHeight: 19 },
  secondaryActions: { gap: 9 },
  legalLinks: { alignItems: "center", gap: 12, paddingVertical: 4 },
  legal: { fontFamily: FONTS.montserrat, color: "#636128", textDecorationLine: "underline", fontSize: 13 },
});

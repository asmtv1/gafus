import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, View } from "react-native";
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
  const [selection, setSelection] = useState<string>();
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
    refetchInterval: (query) => pending || query.state.data?.data?.status === "PENDING" ? 15_000 : false,
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
  const selected = offers.find((item) => item.offerToken === selection) ?? offers[0];
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
  const hasPendingPayment = pending || status?.status === "PENDING";
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
            <Text style={styles.brand}>GAFUS PREMIUM</Text>
            <View style={styles.card}>
              <Text style={styles.title}>{active ? "Premium активен" : "Подписка через Google Play"}</Text>
              {active ? (
                <>
                  {status.activeUntil ? <Text>Доступ до {new Date(status.activeUntil).toLocaleDateString("ru-RU")}</Text> : null}
                  {status.provider === "YOOKASSA" && !status.cancelAtPeriodEnd ? (
                    <Button label="Отключить автопродление" disabled={controlsBusy} onPress={() => void withLock(async () => {
                      const result = await appSubscriptionGoogleApi.cancelExistingYookassaRenewal(sameOwner);
                      if (!result.success) throw new Error("CANCEL_RENEWAL");
                      await refresh();
                    })} />
                  ) : null}
                </>
              ) : (
                <>
                  <Text>Курсы, экзамены, статьи и дополнительные возможности Premium.</Text>
                  {offers.map((item) => (
                    <Button key={item.productId + ":" + item.basePlanId} label={item.title + " · " + item.price + " / " + item.period}
                      variant={selected === item ? "selected" : "outline"} disabled={controlsBusy}
                      onPress={() => setSelection(item.offerToken)} />
                  ))}
                  {catalog.isFetching || store.isFetching ? <Text>Загружаем цены Google Play…</Text> : null}
                  {!catalog.isFetching && !store.isFetching && !offers.length ? <Text>Тарифы Google Play пока недоступны.</Text> : null}
                  <Button label="Оформить через Google Play" disabled={controlsBusy || hasPendingPayment || !selected || !status || !sameOwner()}
                    onPress={() => void buy()} />
                </>
              )}
            </View>
            {ownerId && authEpoch && status && !active && !hasPendingPayment ? <OptionalCardCheckout
              ownerKey={ownerId + authEpoch} sameOwner={sameOwner} busy={controlsBusy}
              withLock={withLock} refresh={refresh} report={setMessage} /> : null}
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
            <Text style={styles.legal} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>Политика конфиденциальности</Text>
            {message ? <Text accessibilityRole="alert">{message}</Text> :
              hasPendingPayment ? <Text accessibilityRole="alert">Ожидаем подтверждения оплаты.</Text> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F0DF" },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 28 },
  inner: { width: "100%", maxWidth: 640, alignSelf: "center", gap: 18 },
  brand: { fontFamily: FONTS.impact, fontSize: 30, color: "#636128", textAlign: "center" },
  card: { backgroundColor: "#FFFDF5", borderRadius: 22, padding: 22, gap: 16 },
  title: { fontFamily: FONTS.montserratBold, fontSize: 21, color: "#352E2E" },
  legal: { fontFamily: FONTS.montserrat, color: "#636128", textDecorationLine: "underline" },
});

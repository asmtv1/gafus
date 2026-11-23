/**
 * Signed RuStore-only 1.7.5 OTA checkout. Metro resolves this file exclusively
 * for the verified android-rustore-yookassa payment profile, never for Play.
 * The plan cards and promo UI are the same source as the iOS 1.7.5 YooKassa OTA.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useAuthStore } from "@/shared/stores/authStore";
import { appSubscriptionAppleApi } from "../api/appSubscriptionAppleApi";
import { usePaywallStore } from "../store/paywallStore";
import { InternalCardCheckout } from "./InternalCardCheckout";
import { premium172Styles as styles } from "./Premium172Appearance";

export function AppSubscriptionPaywall() {
  const insets = useSafeAreaInsets();
  const close = usePaywallStore(s => s.close);
  const client = useQueryClient();
  const owner = useAuthStore(s => s.user?.id ?? null);
  const initialBinding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = initialBinding?.principalId === owner ? initialBinding.authEpoch : null;
  const ownerKey = JSON.stringify([owner, epoch]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const attempt = useRef(0);
  const inFlight = useRef(false);
  const sameOwner = useCallback(() => {
    const live = newOnlyV2NativeQueues.getVerifiedBinding();
    return Boolean(owner && epoch && useAuthStore.getState().user?.id === owner &&
      live?.principalId === owner && live?.authEpoch === epoch);
  }, [owner, epoch]);
  useEffect(() => {
    attempt.current += 1;
    inFlight.current = false;
    setBusy(false);
    setNotice(null);
  }, [owner, epoch]);
  const status = useQuery({
    queryKey: ["app-subscription", "status", owner, epoch],
    enabled: Boolean(owner && epoch),
    queryFn: () => appSubscriptionAppleApi.getStatus(sameOwner),
    refetchInterval: 15000,
  });
  const refresh = useCallback(async () => {
    if (!sameOwner()) return;
    await Promise.all([
      client.invalidateQueries({queryKey:["app-subscription"]}),
      client.invalidateQueries({queryKey:["trainingDay"]}),
      client.invalidateQueries({queryKey:["trainingDays"]}),
      client.invalidateQueries({queryKey:["dailyCourse"]}),
    ]);
  }, [client, sameOwner]);
  const withLock = useCallback(async (operation: () => Promise<void>) => {
    if (!sameOwner() || inFlight.current) return;
    inFlight.current = true;
    const attemptId = ++attempt.current;
    setBusy(true);
    setNotice(null);
    try { await operation(); }
    catch { if (sameOwner()) setNotice("Не удалось завершить операцию. Проверьте статус подписки."); }
    finally {
      if (attempt.current === attemptId) {
        inFlight.current = false;
        if (sameOwner()) setBusy(false);
      }
    }
  }, [sameOwner]);
  const current = status.data?.success ? status.data.data : null;
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
    <StatusBar hidden />
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={[styles.content,{paddingTop:Math.max(insets.top + 14,58)}]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.contentInner}>
          <AppBackButton style={styles.backRow} onPress={close} />
          <View style={styles.header}>
            <Text style={styles.brand}>GAFUS PREMIUM</Text>
          </View>
          {!owner || !epoch ? <Text>Войдите в аккаунт, чтобы оформить Premium.</Text>
            : status.isError ? <Button label="Повторить загрузку" onPress={() => void status.refetch()} />
            : current?.hasActiveSubscription ? <View style={styles.planCard}>
              <Text style={styles.sectionTitle}>Premium активен</Text>
              {current.activeUntil ? <Text style={styles.cardSubtitle}>Доступ до {new Date(current.activeUntil).toLocaleDateString("ru-RU")}</Text> : null}
              {current.provider === "YOOKASSA" && !current.cancelAtPeriodEnd ?
                <Button label="Отключить автопродление" disabled={busy} onPress={() => void withLock(async () => {
                  const res = await appSubscriptionAppleApi.cancelExistingYookassaRenewal(sameOwner);
                  if (!res.success) throw new Error("CANCEL_FAILED");
                  await refresh();
                })} /> : null}
            </View>
            : <InternalCardCheckout ownerKey={ownerKey} sameOwner={sameOwner} busy={busy}
                withLock={withLock} refresh={refresh} report={setNotice} androidRustore />}
          {notice ? <Text accessibilityRole="alert" style={{color:"#352E2E", textAlign:"center"}}>{notice}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Browser from "expo-web-browser";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Text } from "react-native-paper";
import { Linking, View } from "react-native";
import { Button } from "@/shared/components/ui";
import { apiClient } from "@/shared/lib/api/client";
import { ensureOtaInstallationIdentity } from "@/shared/lib/ota/installationIdentity";
import { appSubscriptionAppleApi } from "../api/appSubscriptionAppleApi";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import type { AppSubscriptionOfferDto, AppSubscriptionPlanCode } from "../api/appSubscriptionApi";
import type { CardCheckoutProps } from "./OptionalCardCheckout";

const callback = "gafus://subscription-return";
async function contextHeaders() {
  return {
    "X-OTA-Installation": (await ensureOtaInstallationIdentity()) ?? "",
    "X-OTA-Fingerprint": String(Constants.expoConfig?.extra?.otaNativeFingerprint ?? ""),
    "X-OTA-Update": Updates.updateId ?? "",
  };
}
export function InternalCardCheckout({
  ownerKey,
  sameOwner,
  busy,
  withLock,
  refresh,
  report,
  androidQa = false,
}: CardCheckoutProps & { androidQa?: boolean }) {
  const [checking, setChecking] = useState(false);
  const offer = useQuery({
    queryKey: ["app-subscription", "internal-card", ownerKey],
    enabled: sameOwner(),
    refetchInterval: 30_000,
    queryFn: async () =>
      apiClient<AppSubscriptionOfferDto>("/api/v1/app-subscription/offer", {
        headers: await contextHeaders(),
        requestGuard: sameOwner,
      }),
  });
  const data = offer.data?.success ? offer.data.data : null;
  if (!sameOwner() || (!checking && !(androidQa ? data?.androidQaCardPaymentEnabled : data?.iosRuCardPaymentEnabled))) return null;

  async function checkStatus() {
    for (let attempt = 0; attempt < 4 && sameOwner(); attempt++) {
      const status = await appSubscriptionAppleApi.getStatus(sameOwner);
      if (!sameOwner()) return;
      if (status.success && status.data?.hasActiveSubscription) {
        await refresh();
        if (sameOwner()) {
          setChecking(false);
          report("Premium активен.");
        }
        return;
      }
      if (
        status.success &&
        (status.data?.status === "CANCELED" || status.data?.status === "REFUNDED")
      ) {
        setChecking(false);
        report("Подписка не активирована. Можно выбрать тариф снова.");
        return;
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    if (sameOwner()) report("Оплата пока не подтверждена. Проверьте статус перед повтором.");
  }

  async function pay(planCode: AppSubscriptionPlanCode) {
    const result = await apiClient<{ confirmationUrl: string }>(
      "/api/v1/app-subscription/yookassa/start",
      {
        method: "POST",
        body: { planCode },
        headers: await contextHeaders(),
        requestGuard: sameOwner,
        skipAuthRefreshReplay: true,
      },
    );
    if (!sameOwner()) return;
    if (!result.success && result.code === "FEATURE_DISABLED") {
      await offer.refetch();
      if (sameOwner()) report("Оплата недоступна для этой версии.");
      return;
    }
    if (
      !result.success &&
      result.code &&
      ["PLAN_NOT_AVAILABLE", "SUBSCRIPTION_EMAIL_REQUIRED", "VALIDATION_ERROR"].includes(
        result.code,
      )
    ) {
      report(result.error ?? "Не удалось оформить подписку.");
      return;
    }
    setChecking(true);
    const url = result.data?.confirmationUrl;
    if (!result.success || !url || !url.startsWith("https://")) {
      await checkStatus();
      return;
    }
    try {
      const page = await Browser.openAuthSessionAsync(url, callback);
      if (sameOwner() && (page.type === "cancel" || page.type === "dismiss"))
        report("Платёжная страница закрыта. Проверяем статус.");
    } catch {
      if (sameOwner()) report("Не удалось вернуться с платёжной страницы. Проверяем статус.");
    } finally {
      if (sameOwner()) await checkStatus();
    }
  }
  return (
    <View>
      <Text>Оплата через ЮKassa</Text>
      {!androidQa && <Text>Отдельная подписка с автоматическим продлением, оформляемая вне App Store. Период и стоимость указаны для каждого тарифа.</Text>}
      {checking ? (
        <Button
          label="Проверить оплату"
          disabled={busy}
          onPress={() => void withLock(checkStatus)}
        />
      ) : (
        data?.yookassaPlans
          .filter((p) => p.enabled)
          .map((plan) => (
            <Button
              key={plan.code}
              label={`${plan.title} · ${plan.yookassaPriceRub} ₽ / ${plan.intervalDays} дн.`}
              disabled={busy}
              onPress={() => void withLock(() => pay(plan.code))}
            />
          ))
      )}
      {!checking && data?.yookassaPlans?.every((p) => !p.enabled) && (
        <Text>Сейчас нет доступных тарифов ЮKassa.</Text>
      )}
      {!androidQa && (
        <View>
          <Text onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}>
            Публичная оферта и правила автопродления
          </Text>
          <Text onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>
            Политика конфиденциальности
          </Text>
        </View>
      )}
    </View>
  );
}

export { InternalCardCheckout as OptionalCardCheckout };

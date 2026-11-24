import { resolveAppSubscriptionTier } from "@gafus/types";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Browser from "expo-web-browser";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Linking, Pressable, View } from "react-native";
import { Text } from "react-native-paper";

import { FONTS } from "@/shared/config";
import { Button, Input } from "@/shared/components/ui";
import { apiClient } from "@/shared/lib/api/client";
import { ensureOtaInstallationIdentity } from "@/shared/lib/ota/installationIdentity";
import { appSubscriptionAppleApi } from "../api/appSubscriptionAppleApi";
import type { AppSubscriptionOfferDto, AppSubscriptionPlanCode, AppSubscriptionPlanOfferDto, AppSubscriptionPromoCodePreviewDto } from "../api/appSubscriptionApi";
import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";
import {
  getPromoCodePricePresentation,
  getPromoCodeStateMessage,
  promoCodeStateFromErrorCode,
  shouldBlockYookassaStartForPromo,
  shouldShowSubscriptionPromoCode,
  type PromoCodeUiState,
} from "./SignedOtaPromoPresentation";
import {
  PREMIUM_OFFLINE_BENEFIT,
  PREMIUM_PLAN_BENEFITS,
  Premium172BenefitRow,
  premium172Styles as styles,
  premiumPlanIncludesOffline,
} from "./Premium172Appearance";
import type { CardCheckoutProps } from "./OptionalCardCheckout";

/** The exact 1.7.2 card treatment, delivered only in an approved signed iOS OTA. */
const callback = "gafus://subscription-return";
const PLAN_ORDER: readonly AppSubscriptionPlanCode[] = ["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"];

// The original 1.7.2 plan formatting is pure. Keep this in the signed checkout
// module rather than importing the retired mixed-payment presentation graph.
function formatRub(value: number): string {
  return `${value.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;
}
function getYookassaPrimaryCta(priceRub?: number | null): string {
  return Number.isFinite(priceRub) && Number(priceRub) > 0
    ? `Оплатить ${formatRub(Number(priceRub))} по СБП` : "Оплатить по СБП";
}
function getYookassaPaymentCaption(): string {
  return "Списание произойдёт при оформлении подписки.";
}
function formatPlanPeriod(intervalDays: number | null | undefined): string {
  if (intervalDays === 14) return "14 дней";
  if (intervalDays === 30) return "30 дней";
  if (intervalDays === 90) return "90 дней";
  return `${intervalDays ?? 0} дн.`;
}
function formatAppSubscriptionPlanPrice(plan: AppSubscriptionPlanOfferDto): string {
  const price=Number(plan.yookassaPriceRub);
  if (!Number.isFinite(price) || price <= 0) return "—";
  return `${formatRub(price)}/${plan.intervalDays === 30 ? "месяц" : formatPlanPeriod(plan.intervalDays)}`;
}
function formatSavingsRub(savingsRub: number | null | undefined): string | null {
  const amount=Number(savingsRub);
  return Number.isFinite(amount) && amount>0 ? `Экономия ${formatRub(amount)}` : null;
}
function selectDefaultAppSubscriptionPlan<T extends AppSubscriptionPlanOfferDto>(plans: readonly T[]): T | null {
  return plans.find((p) => resolveAppSubscriptionTier(p.planTier ?? p.code) === "STANDARD") ?? plans[0] ?? null;
}

function badgeStyle(badge: AppSubscriptionPlanOfferDto["badge"]) {
  if (badge === "POPULAR") return [styles.badgeChip, styles.badgePopular];
  if (badge === "MAX_SAVINGS") return [styles.badgeChip, styles.badgeSavings];
  return [styles.badgeChip, styles.badgeTry];
}
function badgeLabel(badge: AppSubscriptionPlanOfferDto["badge"]) {
  if (badge === "POPULAR") return "Популярный";
  if (badge === "MAX_SAVINGS") return "Максимальная экономия";
  return "Попробовать";
}
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
  androidRustore = false,
}: CardCheckoutProps & { androidQa?: boolean; androidRustore?: boolean }) {
  const [selectedPlanCode, setSelectedPlanCode] = useState<AppSubscriptionPlanCode | null>(null);
  const [checking, setChecking] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoPreview, setPromoPreview] = useState<AppSubscriptionPromoCodePreviewDto | null>(null);
  const [promoState, setPromoState] = useState<PromoCodeUiState>("idle");
  const [promoBusy, setPromoBusy] = useState(false);
  const savedPromoHandled = useRef(false);
  const promoRequestGeneration = useRef(0);
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
  const plans = (data?.yookassaPlans ?? [])
    .filter((plan) => plan.enabled)
    .slice()
    .sort((a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code));
  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode) ?? selectDefaultAppSubscriptionPlan(plans);
  const promoPlanCode = selectedPlan?.code === "MONTHLY" || selectedPlan?.code === "THREE_MONTHS"
    ? selectedPlan.code : null;
  const showPromo = shouldShowSubscriptionPromoCode({
    canUseYookassa: Boolean(androidRustore ? data?.androidRustoreCardPaymentEnabled : androidQa ? data?.androidQaCardPaymentEnabled : data?.iosRuCardPaymentEnabled) && Boolean(promoPlanCode),
    entryEnabled: data?.promoCode?.entryEnabled ?? false,
    eligible: data?.promoCode?.eligible ?? false,
  });
  const promoPrice = promoPreview && promoPreview.planCode === promoPlanCode
    && promoPreview.code.trim().toUpperCase() === promoInput.trim().toUpperCase()
    ? getPromoCodePricePresentation(promoPreview) : null;
  const promoError = !["idle", "checking", "applied"].includes(promoState);

  async function applyPromo(raw = promoInput, planCode = promoPlanCode) {
    if (!showPromo || !planCode || promoBusy || busy || !sameOwner()) return;
    const promoCode = raw.trim();
    if (!promoCode) {
      setPromoPreview(null);
      setPromoState("idle");
      return;
    }
    const generation = ++promoRequestGeneration.current;
    setPromoPreview(null);
    setPromoBusy(true);
    setPromoState("checking");
    try {
      const result = await apiClient<AppSubscriptionPromoCodePreviewDto>(
        "/api/v1/app-subscription/promo-code/preview", {
          method: "POST",
          headers: await contextHeaders(),
          body: { planCode, promoCode },
          requestGuard: sameOwner,
        },
      );
      if (!sameOwner() || generation !== promoRequestGeneration.current) return;
      if (result.success && result.data && result.data.planCode === planCode) {
        setPromoPreview(result.data);
        setPromoState("applied");
      } else {
        setPromoState(promoCodeStateFromErrorCode(result.code));
      }
    } catch {
      if (sameOwner() && generation === promoRequestGeneration.current) setPromoState("network_error");
    } finally {
      if (sameOwner() && generation === promoRequestGeneration.current) setPromoBusy(false);
    }
  }

  // Reuse saved registration promo codes, without silently starting payment.
  useEffect(() => {
    if (!showPromo || !promoPlanCode || savedPromoHandled.current) return;
    const saved = data?.savedRegistrationPromoCode;
    if (!saved || saved.status !== "ACTIVE" || !saved.code.trim()) return;
    savedPromoHandled.current = true;
    const code = saved.code.trim();
    setPromoInput(code);
    void applyPromo(code, promoPlanCode);
  }, [showPromo, promoPlanCode, data?.savedRegistrationPromoCode?.code, data?.savedRegistrationPromoCode?.status]);

  if (!sameOwner() || (!checking && !(androidRustore ? data?.androidRustoreCardPaymentEnabled : androidQa ? data?.androidQaCardPaymentEnabled : data?.iosRuCardPaymentEnabled))) return null;

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
    const validPromo = showPromo && promoPreview?.planCode === planCode
      && promoPreview.code.trim().toUpperCase() === promoInput.trim().toUpperCase()
      ? promoPreview : null;
    if (showPromo && shouldBlockYookassaStartForPromo({
      hasPromoText: promoInput.trim().length > 0,
      hasAppliedPreview: Boolean(validPromo) && promoState === "applied",
    })) {
      setPromoState("needs_apply");
      return;
    }
    const result = await apiClient<{ confirmationUrl: string }>(
      "/api/v1/app-subscription/yookassa/start",
      {
        method: "POST",
        body: { planCode, ...(validPromo ? { promoCode: { code: validPromo.code, revision: validPromo.revision } } : {}) },
        headers: await contextHeaders(),
        requestGuard: sameOwner,
        skipAuthRefreshReplay: true,
      },
    );
    if (!sameOwner()) return;
    if (!result.success && result.code?.startsWith("PROMO_")) {
      setPromoPreview(null);
      setPromoState(promoCodeStateFromErrorCode(result.code));
      return;
    }
    if (!result.success && result.code === "FEATURE_DISABLED") {
      await offer.refetch();
      if (sameOwner()) report("Оплата недоступна для этой версии.");
      return;
    }
    if (
      !result.success && result.code &&
      ["PLAN_NOT_AVAILABLE", "SUBSCRIPTION_EMAIL_REQUIRED", "VALIDATION_ERROR"].includes(result.code)
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
    <View style={styles.providerSection}>
      <Text style={styles.sectionTitle}>Оплата по СБП</Text>
      {checking ? (
        <Button
          label="Проверить оплату" height={56} fontFamily={FONTS.impact}
          fontWeight="400" fontSize={17} lineHeight={22} verticalPadding={0}
          borderRadius={20} animatedPress disabled={busy}
          onPress={() => void withLock(checkStatus)}
        />
      ) : (
        <>
          {plans.length > 0 ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="Тариф ЮKassa" style={styles.plansList}>
              {plans.map((plan) => {
                const selected = selectedPlan?.code === plan.code;
                const savings = formatSavingsRub(plan.savingsRub);
                return (
                  <Pressable
                    key={plan.code}
                    style={({ pressed }) => [
                      styles.planCard,
                      selected && styles.planCardSelected,
                      pressed && styles.planCardPressed,
                    ]}
                    onPress={() => {
                      if (selectedPlan?.code !== plan.code) {
                        setSelectedPlanCode(plan.code);
                        ++promoRequestGeneration.current;
                        setPromoPreview(null);
                        setPromoBusy(false);
                        setPromoInput("");
                        setPromoState("idle");
                      }
                    }}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected, disabled: busy }}
                  >
                    <View style={styles.planTopRow}>
                      <View style={styles.planTitleBlock}>
                        <Text style={styles.cardTitle}>{plan.label ?? plan.title}</Text>
                        <Text style={styles.cardSubtitle}>{formatPlanPeriod(plan.intervalDays)}</Text>
                      </View>
                      {plan.badge ? (
                        <View style={badgeStyle(plan.badge)}>
                          <Text style={[
                            styles.badgeChipText,
                            plan.badge === "TRY" && styles.badgeTryText,
                            plan.badge === "MAX_SAVINGS" && styles.badgeSavingsText,
                          ]}>
                            {badgeLabel(plan.badge)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.planPriceBlock}>
                      <Text style={styles.planPrice}>{formatAppSubscriptionPlanPrice(plan)}</Text>
                      {savings ? <Text style={styles.savingsText}>{savings}</Text> : null}
                    </View>
                    <View style={[styles.selectedRow, selected && styles.selectedRowActive]}>
                      <View style={[styles.selectionIconSurface, selected && styles.selectionIconSurfaceActive]}>
                        <MaterialCommunityIcons
                          name={selected ? "radiobox-marked" : "radiobox-blank"}
                          size={22} color="#636128"
                        />
                      </View>
                      <Text style={styles.selectedLabel}>{selected ? "Выбрано" : "Выбрать тариф"}</Text>
                    </View>
                    <View style={styles.benefits}>
                      {PREMIUM_PLAN_BENEFITS.map((benefit) => (
                        <Premium172BenefitRow key={benefit} label={benefit} included />
                      ))}
                      <Premium172BenefitRow
                        label={PREMIUM_OFFLINE_BENEFIT}
                        included={premiumPlanIncludesOffline(plan)}
                      />
                      <Premium172BenefitRow
                        label="Чат с кинологом"
                        included={Boolean(plan.cynologistChatIncluded)}
                      />
                      <Premium172BenefitRow
                        label="Запись к кинологу"
                        included={Boolean(plan.consultationBookingIncluded)}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.pendingText}>Подписка через ЮKassa сейчас недоступна.</Text>
          )}
          {showPromo ? (
            <View style={[styles.promoCard, promoState === "applied" && styles.promoCardApplied]}
              accessibilityLabel="Промокод для первого платежа через ЮKassa">
              {data?.savedRegistrationPromoCode && data.savedRegistrationPromoCode.status !== "ACTIVE" ? (
                <Text style={[styles.promoMessage, styles.promoErrorMessage]} accessibilityRole="alert">
                  Сохранённый промокод больше не действует. Примените другой или оставьте поле пустым.
                </Text>
              ) : null}
              <View style={styles.promoHeadingRow}>
                <Text style={styles.promoTitle}>Промокод</Text>
                {promoPrice ? (
                  <View style={styles.promoChip}>
                    <Text style={styles.promoChipText}>{promoPrice.discount}</Text>
                  </View>
                ) : null}
              </View>
              <Input
                value={promoInput}
                label="Промокод"
                placeholder="Например, GAFUS"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
                maxLength={64}
                disabled={busy || promoBusy}
                onChangeText={(text) => {
                  ++promoRequestGeneration.current;
                  setPromoBusy(false);
                  setPromoInput(text);
                  setPromoPreview(null);
                  setPromoState("idle");
                }}
                onSubmitEditing={() => void applyPromo()}
                accessibilityLabel="Введите промокод"
                style={styles.promoInput}
              />
              {getPromoCodeStateMessage(promoState) ? (
                <Text style={[styles.promoMessage, promoError && styles.promoErrorMessage]}
                  accessibilityRole={promoError ? "alert" : "text"}>
                  {getPromoCodeStateMessage(promoState)}
                </Text>
              ) : null}
              <Button
                label={promoBusy ? "Проверяем…" : "Применить"}
                height={47} fontFamily={FONTS.montserratBold}
                fontSize={14} lineHeight={18} verticalPadding={0}
                animatedPress loading={promoBusy}
                disabled={!promoInput.trim() || busy || promoBusy}
                onPress={() => void applyPromo()}
              />
              {promoPrice ? (
                <View style={styles.promoPriceBlock}
                  accessible accessibilityLabel={`${promoPrice.firstCharge}. ${promoPrice.nextCharge}. ${promoPrice.legal}`}>
                  <Text style={styles.promoChargeLabel}>Сейчас спишется</Text>
                  <View style={styles.promoPriceRow}>
                    <Text style={styles.promoOriginalPrice}>{promoPrice.originalPrice}</Text>
                    <Text style={styles.promoDiscountedPrice}>{promoPrice.discounted}</Text>
                  </View>
                  <Text style={styles.promoRenewal}>{promoPrice.nextCharge}</Text>
                  <Text style={styles.promoFirstPaymentNotice}>{promoPrice.legal}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {selectedPlan ? (
            <Button
              label={promoPrice ? `Оплатить ${promoPrice.discounted} по СБП` : getYookassaPrimaryCta(selectedPlan.yookassaPriceRub)}
              icon={() => (
                <Image
                  source={require("../../../../assets/images/sbp-logo.svg")}
                  style={styles.sbpIcon} contentFit="contain" accessible={false}
                />
              )}
              height={56} fontFamily={FONTS.impact} fontWeight="400"
              fontSize={17} lineHeight={22} verticalPadding={0}
              borderRadius={20} animatedPress
              disabled={busy || !sameOwner()}
              onPress={() => void withLock(() => pay(selectedPlan.code))}
            />
          ) : null}
        </>
      )}
      <Text style={styles.providerCaption}>{getYookassaPaymentCaption()}</Text>
      <Text style={styles.legalText}>
        Нажимая кнопку оплаты, вы принимаете{" "}
        <Text style={styles.legalLink} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer)}>
          Оферту
        </Text>{" "}и{" "}
        <Text style={styles.legalLink} onPress={() => void Linking.openURL(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy)}>
          Политику конфиденциальности
        </Text>
        . Подписка продлевается автоматически; способ оплаты сохраняется в ЮKassa для продления.
      </Text>
    </View>
  );
}

export { InternalCardCheckout as OptionalCardCheckout };

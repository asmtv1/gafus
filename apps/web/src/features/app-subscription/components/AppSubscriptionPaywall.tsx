"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { CloseIcon, IconButton } from "@shared/utils/muiImports";
import {
  AppSubscriptionApiError,
  type AppSubscriptionPromoCodePreview,
  fetchAppSubscriptionOffer,
  previewAppSubscriptionPromoCode,
  startAppSubscriptionYookassaPayment,
} from "@/shared/lib/app-subscription/client";
import {
  formatAppSubscriptionRubAmount,
  getAppSubscriptionPlanBadgeText,
  getAppSubscriptionPlanSavingsText,
  getAppSubscriptionPromoPricePresentation,
  getYookassaLegalText,
  getYookassaPriceNote,
  getYookassaPrimaryCta,
  getYookassaReturnSuccessTitle,
  formatAppSubscriptionPlanPrice,
  getAppSubscriptionPlanPeriodText,
  selectDefaultAppSubscriptionPlan,
  sortYookassaSubscriptionPlans,
} from "@/shared/lib/app-subscription/presentation";
import {
  APP_SUBSCRIPTION_PROMO_CODE_MESSAGES,
  getAppSubscriptionPromoCodeErrorState,
  isAppSubscriptionPromoCodeInputValid,
  shouldBlockAppSubscriptionCheckoutForPromo,
  type AppSubscriptionPromoCodeUiState,
} from "@/shared/lib/app-subscription/promo-code-ui";
import { PrimaryButton } from "@shared/components/ui";
import styles from "./app-subscription-paywall.module.css";

type AppSubscriptionPlanCode = "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
type PromoEligiblePlanCode = Extract<AppSubscriptionPlanCode, "MONTHLY" | "THREE_MONTHS">;

type AppSubscriptionPlanOffer = {
  code: AppSubscriptionPlanCode;
  label: string;
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  enabled: boolean;
  appleProductId: string | null;
  offlineCourseDownloadIncluded?: boolean;
  consultationBookingIncluded: boolean;
  promoCodeEligible: boolean;
  badge: "TRY" | "POPULAR" | "MAX_SAVINGS" | null;
  savingsRub: number | null;
};

type AppSubscriptionOffer = {
  plans: AppSubscriptionPlanOffer[];
  yookassaPlans?: AppSubscriptionPlanOffer[];
  applePlan?: AppSubscriptionPlanOffer | null;
  promoCode: {
    entryEnabled: boolean;
    eligible: boolean;
  };
};

type AppSubscriptionPaywallProps = {
  mode?: "page" | "embedded";
  onClose?: () => void;
};

const FALLBACK_APP_SUBSCRIPTION_PLANS: AppSubscriptionPlanOffer[] = [
  {
    code: "MONTHLY",
    label: "monthly",
    title: "Месячный",
    intervalDays: 30,
    yookassaPriceRub: 2500,
    enabled: true,
    appleProductId: null,
    offlineCourseDownloadIncluded: true,
    consultationBookingIncluded: true,
    promoCodeEligible: true,
    badge: "POPULAR",
    savingsRub: null,
  },
];

const PLAN_BENEFITS = [
  "Курсы, экзамены и статьи",
  "Документы и напоминания",
] as const;

function getPlanBadgeClass(badge: AppSubscriptionPlanOffer["badge"]): string {
  if (badge === "TRY") return styles.planBadgeTry;
  if (badge === "MAX_SAVINGS") return styles.planBadgeMaxSavings;
  return styles.planBadgePopular;
}

function isPromoEligiblePlanCode(code: AppSubscriptionPlanCode): code is PromoEligiblePlanCode {
  return code === "MONTHLY" || code === "THREE_MONTHS";
}

function includesOfflineCourseDownload(plan: AppSubscriptionPlanOffer): boolean {
  return (
    plan.offlineCourseDownloadIncluded ??
    (plan.code === "MONTHLY" || plan.code === "THREE_MONTHS")
  );
}

export function AppSubscriptionPaywall({ mode = "page", onClose }: AppSubscriptionPaywallProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const promoInputId = useId();
  const promoMessageId = useId();
  const promoInputRef = useRef<HTMLInputElement>(null);
  const promoRequestIdRef = useRef(0);
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("2 500 ₽/месяц");
  const [offer, setOffer] = useState<AppSubscriptionOffer | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<AppSubscriptionPlanCode | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoState, setPromoState] = useState<AppSubscriptionPromoCodeUiState>("idle");
  const [promoPreview, setPromoPreview] = useState<AppSubscriptionPromoCodePreview | null>(null);
  const [returnState, setReturnState] = useState<"idle" | "checking" | "success" | "pending">(
    "idle",
  );
  const isPaidReturn = searchParams.get("paid") === "1";

  useEffect(() => {
    if (!csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [csrfToken, csrfLoading, fetchToken]);

  const loadOffer = useCallback(async () => {
    try {
      const response = await fetchAppSubscriptionOffer();
      if (response?.data) {
        setOffer(response.data as AppSubscriptionOffer);
      }
      const plans = Array.isArray(response?.data?.yookassaPlans)
        ? response.data.yookassaPlans
        : Array.isArray(response?.data?.plans)
          ? response.data.plans
          : [];
      const defaultOfferPlan = selectDefaultAppSubscriptionPlan(plans);
      if (defaultOfferPlan) {
        setSelectedPlanCode(defaultOfferPlan.code);
        setPriceText(formatAppSubscriptionPlanPrice(defaultOfferPlan));
      }
    } catch {
      // Keep the fallback price and hide eligibility-dependent entry points.
    }
  }, []);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) return csrfToken;
    await fetchToken();
    return useCSRFStore.getState().token;
  }, [csrfToken, fetchToken]);

  const enabledPlans = useMemo(() => {
    const sourcePlans = offer?.yookassaPlans ?? offer?.plans ?? FALLBACK_APP_SUBSCRIPTION_PLANS;
    return sortYookassaSubscriptionPlans(sourcePlans);
  }, [offer]);
  const defaultPlan = useMemo(() => selectDefaultAppSubscriptionPlan(enabledPlans), [enabledPlans]);
  const selectedPlan = enabledPlans.find((plan) => plan.code === selectedPlanCode) ?? defaultPlan;
  const selectedPriceText = selectedPlan ? formatAppSubscriptionPlanPrice(selectedPlan) : priceText;
  const promoEntryVisible = Boolean(
    offer?.promoCode?.entryEnabled &&
      offer.promoCode.eligible &&
      selectedPlan?.promoCodeEligible &&
      selectedPlan &&
      isPromoEligiblePlanCode(selectedPlan.code),
  );
  const promoPresentation = promoPreview
    ? getAppSubscriptionPromoPricePresentation(promoPreview)
    : null;
  const currentChargeText = promoPreview
    ? formatAppSubscriptionRubAmount(promoPreview.discountedPriceRub)
    : formatAppSubscriptionRubAmount(selectedPlan?.yookassaPriceRub);
  const renewalPriceText = promoPreview
    ? `${formatAppSubscriptionRubAmount(promoPreview.renewalPriceRub)} каждые ${promoPreview.intervalDays} дней`
    : selectedPriceText;

  const resetPromo = useCallback(() => {
    promoRequestIdRef.current += 1;
    setPromoInput("");
    setPromoPreview(null);
    setPromoState("idle");
    setError(null);
  }, []);

  const selectPlan = useCallback(
    (planCode: AppSubscriptionPlanCode) => {
      setSelectedPlanCode(planCode);
      resetPromo();
    },
    [resetPromo],
  );

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

  useEffect(() => {
    if (selectedPlan) {
      setPriceText(formatAppSubscriptionPlanPrice(selectedPlan));
    }
  }, [selectedPlan]);

  useEffect(() => {
    if (!isPaidReturn) return;

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const checkSubscription = async () => {
      setReturnState("checking");

      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const response = await fetch("/api/v1/app-subscription/status", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          });
          const json = await response.json();
          if (!cancelled && response.ok && json?.data?.hasActiveSubscription) {
            setReturnState("success");
            setOffer((current) =>
              current
                ? {
                    ...current,
                    promoCode: { ...current.promoCode, eligible: false },
                  }
                : current,
            );
            void loadOffer();
            router.refresh();
            redirectTimer = setTimeout(() => {
              router.replace("/courses");
            }, 2000);
            return;
          }
        } catch {
          // Retry while YooKassa webhook catches up.
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelled) return;
      }

      setReturnState("pending");
    };

    void checkSubscription();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [isPaidReturn, loadOffer, router]);

  const onPromoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    promoRequestIdRef.current += 1;
    setPromoInput(event.target.value);
    setPromoPreview(null);
    setPromoState("idle");
    setError(null);
  };

  const onApplyPromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlan || !isPromoEligiblePlanCode(selectedPlan.code)) {
      setPromoState("network-error");
      return;
    }

    if (!isAppSubscriptionPromoCodeInputValid(promoInput)) {
      setPromoPreview(null);
      setPromoState("invalid-format");
      return;
    }

    const requestId = promoRequestIdRef.current + 1;
    promoRequestIdRef.current = requestId;
    setPromoPreview(null);
    setPromoState("checking");
    setError(null);

    try {
      const token = await ensureCsrfToken();
      if (!token) throw new AppSubscriptionApiError("CSRF token unavailable", null, 0);
      const preview = await previewAppSubscriptionPromoCode({
        planCode: selectedPlan.code,
        promoCode: promoInput,
        csrfToken: token,
      });
      if (promoRequestIdRef.current !== requestId) return;
      setPromoInput(preview.code);
      setPromoPreview(preview);
      setPromoState("applied");
    } catch (caught) {
      if (promoRequestIdRef.current !== requestId) return;
      const apiError =
        caught instanceof AppSubscriptionApiError
          ? caught
          : new AppSubscriptionApiError("Promo preview failed", null, 0);
      setPromoPreview(null);
      setPromoState(getAppSubscriptionPromoCodeErrorState(apiError.code));
      reportClientError(caught, {
        issueKey: "AppSubscriptionPaywall",
        keys: { operation: "preview_promo_code", code: apiError.code ?? "NETWORK" },
      });
    }
  };

  const onStart = async () => {
    if (!selectedPlan) {
      setError("Подписка сейчас недоступна.");
      return;
    }
    if (
      shouldBlockAppSubscriptionCheckoutForPromo(
        promoInput,
        Boolean(promoPreview && promoState === "applied"),
      )
    ) {
      setError("Сначала примените промокод или очистите поле.");
      promoInputRef.current?.focus();
      return;
    }

    const token = await ensureCsrfToken();
    if (!token) {
      setError("Не удалось получить CSRF токен. Обновите страницу и попробуйте снова.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await startAppSubscriptionYookassaPayment({
        planCode: selectedPlan.code,
        csrfToken: token,
        promoCode: promoPreview
          ? { code: promoPreview.code, revision: promoPreview.revision }
          : undefined,
      });
      const url = data.confirmationUrl;
      if (typeof url === "string" && url.length > 0) {
        window.location.href = url;
        return;
      }
      throw new Error("Ссылка ЮKassa не получена");
    } catch (e) {
      if (
        e instanceof AppSubscriptionApiError &&
        (e.code?.startsWith("PROMO_") || e.code === "SUBSCRIPTION_CHECKOUT_IN_PROGRESS")
      ) {
        setPromoPreview(null);
        setPromoState(getAppSubscriptionPromoCodeErrorState(e.code));
        setError(null);
        promoInputRef.current?.focus();
      } else {
        setError(e instanceof Error ? e.message : "Ошибка ЮKassa. Попробуйте позже.");
      }
      reportClientError(e, {
        issueKey: "AppSubscriptionPaywall",
        keys: { operation: "start_yookassa_subscription" },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`${styles.page} ${mode === "embedded" ? styles.embedded : ""}`}>
      <div className={styles.inner}>
        {returnState === "success" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>{getYookassaReturnSuccessTitle()}</h1>
            <p className={styles.returnText}>Premium активен. Сейчас откроем список курсов.</p>
          </div>
        ) : returnState === "checking" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>Проверяем оплату</h1>
            <p className={styles.returnText}>
              Обычно это занимает несколько секунд после возврата из ЮKassa.
            </p>
          </div>
        ) : returnState === "pending" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>Оплата ещё подтверждается</h1>
            <p className={styles.returnText}>
              Мы не получили подтверждение от ЮKassa. Обновите страницу через несколько секунд.
            </p>
          </div>
        ) : (
          <div className={styles.card}>
            {onClose ? (
              <IconButton
                className={styles.closeButton}
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
              >
                <CloseIcon />
              </IconButton>
            ) : null}
            <div className={styles.hero}>
              <div>
                <p className={styles.kicker}>Gafus Premium</p>
                <h1 className={styles.title}>Подписка, которая экономит время и деньги</h1>
                <p className={styles.subtitle}>
                  Откройте весь практический контент и поддержку специалистов в одном тарифе.
                </p>
              </div>
              <div className={styles.priceCard}>
                <p className={styles.priceLabel}>Выбранный тариф</p>
                <p className={styles.price}>{selectedPriceText}</p>
                <p className={styles.priceNote}>{getYookassaPriceNote()}</p>
              </div>
            </div>

            {enabledPlans.length > 0 ? (
              <div className={styles.planSection}>
                <div className={styles.planSectionHeader}>
                  <p className={styles.planSectionKicker}>Период оплаты</p>
                  <h2 className={styles.planSectionTitle}>Выберите тариф</h2>
                  <p className={styles.planSectionText}>
                    Скачивание курсов и запись к кинологу включены в тарифы от месяца.
                  </p>
                </div>
                <div className={styles.planGrid} role="radiogroup" aria-label="Тарифы подписки">
                  {enabledPlans.map((plan) => {
                    const selected = selectedPlan?.code === plan.code;
                    const badgeText = getAppSubscriptionPlanBadgeText(plan.badge);
                    const savingsText = getAppSubscriptionPlanSavingsText(plan.savingsRub);
                    return (
                      <button
                        key={plan.code}
                        className={`${styles.planButton} ${selected ? styles.planButtonSelected : ""}`}
                        type="button"
                        onClick={() => selectPlan(plan.code)}
                        role="radio"
                        aria-checked={selected}
                      >
                        <span className={styles.planTopLine}>
                          <span className={styles.radioMark} aria-hidden="true">
                            <span className={styles.radioDot} />
                          </span>
                          {badgeText ? (
                            <span className={`${styles.planBadge} ${getPlanBadgeClass(plan.badge)}`}>
                              {badgeText}
                            </span>
                          ) : null}
                        </span>
                        <span className={styles.planTitle}>{plan.title}</span>
                        <span className={styles.planPrice}>
                          {formatAppSubscriptionPlanPrice(plan)}
                        </span>
                        <span className={styles.planPeriod}>
                          {getAppSubscriptionPlanPeriodText(plan)}
                        </span>
                        {savingsText ? (
                          <span className={styles.planSavings}>{savingsText}</span>
                        ) : null}
                        <span className={styles.planBenefits}>
                          {PLAN_BENEFITS.map((benefit) => (
                            <span key={benefit} className={styles.planBenefit}>
                              <span aria-hidden="true">✓</span>
                              {benefit}
                            </span>
                          ))}
                          <span
                            className={`${styles.planBenefit} ${
                              includesOfflineCourseDownload(plan)
                                ? ""
                                : styles.planBenefitUnavailable
                            }`}
                          >
                            <span aria-hidden="true">
                              {includesOfflineCourseDownload(plan) ? "✓" : "—"}
                            </span>
                            Скачивание курсов для офлайн-работы
                            {includesOfflineCourseDownload(plan) ? "" : " — недоступно"}
                          </span>
                          <span
                            className={`${styles.planBenefit} ${
                              plan.consultationBookingIncluded ? "" : styles.planBenefitUnavailable
                            }`}
                          >
                            <span aria-hidden="true">{plan.consultationBookingIncluded ? "✓" : "—"}</span>
                            Запись к кинологу
                            {plan.consultationBookingIncluded ? "" : " — недоступна"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {offer && enabledPlans.length === 0 ? (
              <p className={styles.errorText}>Подписка сейчас недоступна.</p>
            ) : null}

            {promoEntryVisible ? (
              <div
                className={`${styles.promoBlock} ${promoState === "applied" ? styles.promoBlockApplied : ""}`}
              >
                <form className={styles.promoForm} onSubmit={onApplyPromo} noValidate>
                  <label className={styles.promoLabel} htmlFor={promoInputId}>
                    Промокод
                  </label>
                  <div className={styles.promoControls}>
                    <input
                      ref={promoInputRef}
                      id={promoInputId}
                      className={styles.promoInput}
                      type="text"
                      value={promoInput}
                      onChange={onPromoInputChange}
                      aria-describedby={promoMessageId}
                      aria-invalid={
                        promoState !== "idle" &&
                        promoState !== "checking" &&
                        promoState !== "applied"
                      }
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={64}
                      placeholder="Например, KISA1488"
                    />
                    <button
                      className={styles.promoButton}
                      type="submit"
                      disabled={promoState === "checking" || !promoInput.trim()}
                    >
                      {promoState === "checking" ? "Проверяем…" : "Применить"}
                    </button>
                  </div>
                </form>

                <div
                  id={promoMessageId}
                  className={`${styles.promoMessage} ${
                    promoState !== "idle" &&
                    promoState !== "checking" &&
                    promoState !== "applied"
                      ? styles.promoMessageError
                      : ""
                  }`}
                  aria-live="polite"
                  role={
                    promoState !== "idle" &&
                    promoState !== "checking" &&
                    promoState !== "applied"
                      ? "alert"
                      : "status"
                  }
                >
                  {promoState === "applied"
                    ? `Промокод ${promoPreview?.code ?? ""} применён.`
                    : APP_SUBSCRIPTION_PROMO_CODE_MESSAGES[promoState]}
                </div>

                {promoPreview && promoPresentation ? (
                  <div className={styles.promoPrice} aria-label="Цена с промокодом">
                    <div className={styles.promoPriceHeader}>
                      <span className={styles.promoPeriod}>Скидка на первую оплату</span>
                      <span className={styles.promoChip}>{promoPresentation.discountChipText}</span>
                    </div>
                    <strong className={styles.promoNewPrice}>
                      {promoPresentation.currentChargeText}
                    </strong>
                    <p className={styles.promoRenewal}>{promoPresentation.nextRenewalText}</p>
                    <p className={styles.promoRenewal}>{promoPresentation.ongoingRenewalText}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <PrimaryButton
              className={styles.primaryButton}
              onClick={onStart}
              disabled={loading || csrfLoading || !selectedPlan}
              fullWidth
              size="large"
            >
              {loading || csrfLoading
                ? "Переход в ЮKassa..."
                : getYookassaPrimaryCta(currentChargeText)}
            </PrimaryButton>
            <p className={styles.legalText}>
              Нажимая кнопку, вы принимаете{" "}
              <a href="/oferta.html" target="_blank" rel="noopener noreferrer">
                Оферту
              </a>
              : {getYookassaLegalText(currentChargeText, renewalPriceText)}
            </p>
            <p className={styles.assurance}>
              Безопасная оплата через ЮKassa • Способ оплаты сохранится для автопродления
            </p>

            {error ? (
              <p className={styles.errorText} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

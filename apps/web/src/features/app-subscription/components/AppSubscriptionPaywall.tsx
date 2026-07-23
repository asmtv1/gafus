"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { CloseIcon, IconButton } from "@shared/utils/muiImports";
import { fetchAppSubscriptionOffer } from "@/shared/lib/app-subscription/client";
import {
  getYookassaLegalText,
  getYookassaPriceNote,
  getYookassaPrimaryCta,
  getYookassaReturnSuccessTitle,
  formatAppSubscriptionPlanPrice,
  getAppSubscriptionPlanComparisonText,
  getAppSubscriptionPlanPeriodText,
  selectDefaultAppSubscriptionPlan,
} from "@/shared/lib/app-subscription/presentation";
import styles from "./app-subscription-paywall.module.css";

type AppSubscriptionPlanCode = "MONTHLY";

type AppSubscriptionPlanOffer = {
  code: AppSubscriptionPlanCode;
  label: string;
  title: string;
  intervalDays: number;
  yookassaPriceRub: number;
  enabled: boolean;
  appleProductId: string | null;
};

type AppSubscriptionOffer = {
  plans: AppSubscriptionPlanOffer[];
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
  },
];

export function AppSubscriptionPaywall({ mode = "page", onClose }: AppSubscriptionPaywallProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("2 500 ₽/месяц");
  const [offer, setOffer] = useState<AppSubscriptionOffer | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<AppSubscriptionPlanCode | null>(null);
  const [returnState, setReturnState] = useState<"idle" | "checking" | "success" | "pending">(
    "idle",
  );
  const isPaidReturn = searchParams.get("paid") === "1";

  useEffect(() => {
    if (!csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [csrfToken, csrfLoading, fetchToken]);

  useEffect(() => {
    const loadOffer = async () => {
      try {
        const response = await fetchAppSubscriptionOffer();
        if (response?.data) {
          setOffer(response.data as AppSubscriptionOffer);
        }
        const plans = Array.isArray(response?.data?.plans) ? response.data.plans : [];
        const defaultPlan = selectDefaultAppSubscriptionPlan(plans);
        if (defaultPlan) {
          setSelectedPlanCode(defaultPlan.code);
          setPriceText(formatAppSubscriptionPlanPrice(defaultPlan));
        }
      } catch {
        // keep fallback price text
      }
    };

    void loadOffer();
  }, []);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) return csrfToken;
    await fetchToken();
    return useCSRFStore.getState().token;
  }, [csrfToken, fetchToken]);

  const enabledPlans = useMemo(
    () =>
      (offer?.plans ?? FALLBACK_APP_SUBSCRIPTION_PLANS).filter((plan) => plan.enabled !== false),
    [offer],
  );
  const defaultPlan = useMemo(() => selectDefaultAppSubscriptionPlan(enabledPlans), [enabledPlans]);
  const selectedPlan = enabledPlans.find((plan) => plan.code === selectedPlanCode) ?? defaultPlan;
  const selectedPriceText = selectedPlan ? formatAppSubscriptionPlanPrice(selectedPlan) : priceText;

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
  }, [isPaidReturn, router]);

  const onStart = async () => {
    if (!selectedPlan) {
      setError("Подписка сейчас недоступна.");
      return;
    }
    if (!csrfToken) {
      setError("Не удалось получить CSRF токен. Обновите страницу и попробуйте снова.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/app-subscription/yookassa/start", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ planCode: selectedPlan.code }),
      });
      if (!response.ok) {
        throw new Error("Не удалось открыть ЮKassa");
      }
      const data = await response.json();
      const url = data?.data?.confirmationUrl;
      if (typeof url === "string" && url.length > 0) {
        window.location.href = url;
        return;
      }
      throw new Error("Ссылка ЮKassa не получена");
    } catch (e) {
      reportClientError(e, {
        issueKey: "AppSubscriptionPaywall",
        keys: { operation: "start_yookassa_subscription" },
      });
      setError(e instanceof Error ? e.message : "Ошибка ЮKassa. Попробуйте позже.");
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

            {enabledPlans.length > 1 ? (
              <div className={styles.planSection}>
                <div className={styles.planSectionHeader}>
                  <p className={styles.planSectionKicker}>Период оплаты</p>
                  <h2 className={styles.planSectionTitle}>Выберите тариф</h2>
                  <p className={styles.planSectionText}>
                    Наполнение Premium одинаковое. Отличаются только цена и период списания.
                  </p>
                </div>
                <div className={styles.planGrid} role="radiogroup" aria-label="Тарифы подписки">
                  {enabledPlans.map((plan) => {
                    const selected = selectedPlan?.code === plan.code;
                    return (
                      <button
                        key={plan.code}
                        className={`${styles.planButton} ${selected ? styles.planButtonSelected : ""}`}
                        type="button"
                        onClick={() => setSelectedPlanCode(plan.code)}
                        role="radio"
                        aria-checked={selected}
                      >
                        <span className={styles.planTopLine}>
                          <span className={styles.radioMark} aria-hidden="true">
                            <span className={styles.radioDot} />
                          </span>
                          <span className={styles.planBadge}>30 дней</span>
                        </span>
                        <span className={styles.planTitle}>{plan.title}</span>
                        <span className={styles.planPrice}>
                          {formatAppSubscriptionPlanPrice(plan)}
                        </span>
                        <span className={styles.planPeriod}>
                          {getAppSubscriptionPlanPeriodText(plan)}
                        </span>
                        <span className={styles.planComparison}>
                          {getAppSubscriptionPlanComparisonText(plan)}
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

            <div className={styles.valueGrid} aria-label="Что входит в подписку">
              <article className={styles.valueItem}>
                <h2>Курсы и экзамены</h2>
                <p>Полный доступ к обучению, тренировкам и проверке прогресса без ограничений.</p>
              </article>
              <article className={styles.valueItem}>
                <h2>Консультации с кинологом</h2>
                <p>Запись к специалисту для разбора поведения и персональных рекомендаций.</p>
              </article>
              <article className={styles.valueItem}>
                <h2>Статьи и офлайн</h2>
                <p>База материалов под рукой даже без интернета, чтобы учиться в удобном ритме.</p>
              </article>
              <article className={styles.valueItem}>
                <h2>Профилактика и документы</h2>
                <p>Все данные о питомце в одном месте, с доступом к функциям без лимитов.</p>
              </article>
            </div>

            <button
              className={styles.primaryButton}
              type="button"
              onClick={onStart}
              disabled={loading || csrfLoading || !selectedPlan}
            >
              {loading || csrfLoading ? "Переход в ЮKassa..." : getYookassaPrimaryCta()}
            </button>
            <p className={styles.legalText}>
              Нажимая кнопку, вы принимаете{" "}
              <a href="/oferta.html" target="_blank" rel="noopener noreferrer">
                Оферту
              </a>
              : {getYookassaLegalText(selectedPriceText)}
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

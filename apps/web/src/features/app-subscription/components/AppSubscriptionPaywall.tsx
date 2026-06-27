"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { CloseIcon, IconButton } from "@shared/utils/muiImports";
import { fetchAppSubscriptionOffer } from "@/shared/lib/app-subscription/client";
import { renderYandexRewarded } from "@/features/rewarded-ads/yandexRewardedWeb";
import {
  getYookassaLegalText,
  getYookassaPriceNote,
  getYookassaPrimaryCta,
  getYookassaReturnSuccessTitle,
  getYookassaTrialUnavailableText,
  formatAppSubscriptionPlanPrice,
  getAppSubscriptionPlanComparisonText,
  getAppSubscriptionPlanPeriodText,
  selectDefaultAppSubscriptionPlan,
} from "@/shared/lib/app-subscription/presentation";
import styles from "./app-subscription-paywall.module.css";

type AppSubscriptionPlanCode = "WEEKLY" | "MONTHLY";

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
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: number;
  yookassaTrialUnavailableReason?: string | null;
};

type WebRewardedPlatform = "WEB_DESKTOP" | "WEB_TOUCH";

type RewardedCreditsStatus = {
  wallet: {
    balance: number;
    maxBalance: number;
    creditsPerReward: number;
  };
  today: {
    adsWatchedToday: number;
    dailyAdLimit: 1 | 2 | 3;
  };
  settings: {
    platformEnabled: boolean;
    paywallCtaEnabled: boolean;
  };
  canWatchAd: boolean;
  canWatchAdReason:
    | "OK"
    | "PLATFORM_DISABLED"
    | "CTA_DISABLED"
    | "DAILY_LIMIT_REACHED"
    | "BALANCE_FULL";
  nextGrantCredits: number;
};

type RewardedAdSession = {
  sessionId: string;
  requestNonce: string;
  placementId: string;
};

type AppSubscriptionPaywallProps = {
  mode?: "page" | "embedded";
  onClose?: () => void;
  onRewardedGrant?: () => Promise<void> | void;
};

const FALLBACK_APP_SUBSCRIPTION_PLANS: AppSubscriptionPlanOffer[] = [
  {
    code: "WEEKLY",
    label: "weekly",
    title: "Недельный",
    intervalDays: 7,
    yookassaPriceRub: 200,
    enabled: true,
    appleProductId: null,
  },
  {
    code: "MONTHLY",
    label: "monthly",
    title: "Месячный",
    intervalDays: 30,
    yookassaPriceRub: 1100,
    enabled: true,
    appleProductId: null,
  },
];

function getWebRewardedPlatform(): WebRewardedPlatform {
  if (typeof window === "undefined") return "WEB_DESKTOP";
  return window.matchMedia("(pointer: coarse)").matches ? "WEB_TOUCH" : "WEB_DESKTOP";
}

function getRewardedUnavailableText(reason: RewardedCreditsStatus["canWatchAdReason"]): string {
  switch (reason) {
    case "DAILY_LIMIT_REACHED":
      return "Лимит рекламы на сегодня исчерпан.";
    case "BALANCE_FULL":
      return "Баланс кредитов уже заполнен.";
    case "PLATFORM_DISABLED":
    case "CTA_DISABLED":
      return "";
    case "OK":
    default:
      return "";
  }
}

export function AppSubscriptionPaywall({
  mode = "page",
  onClose,
  onRewardedGrant,
}: AppSubscriptionPaywallProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("1 100 ₽/месяц");
  const [offer, setOffer] = useState<AppSubscriptionOffer | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<AppSubscriptionPlanCode | null>(null);
  const [returnState, setReturnState] = useState<
    "idle" | "checking" | "success" | "pending" | "trial-unavailable"
  >("idle");
  const [rewardedStatus, setRewardedStatus] = useState<RewardedCreditsStatus | null>(null);
  const [rewardedLoading, setRewardedLoading] = useState(false);
  const [rewardedMessage, setRewardedMessage] = useState<string | null>(null);
  const isPaidReturn = searchParams.get("paid") === "1" || searchParams.get("trial") === "1";

  const loadRewardedStatus = useCallback(async () => {
    try {
      const platform = getWebRewardedPlatform();
      const response = await fetch(`/api/v1/rewarded-ads/status?platform=${platform}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) return;
      const json = (await response.json()) as { success?: boolean; data?: RewardedCreditsStatus };
      if (response.ok && json.success && json.data) {
        setRewardedStatus(json.data);
      }
    } catch {
      // Rewarded credits are optional on the paywall; keep subscription flow usable.
    }
  }, []);

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

  useEffect(() => {
    void loadRewardedStatus();
  }, [loadRewardedStatus]);

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
          if (
            !cancelled &&
            response.ok &&
            json?.data?.yookassaTrialUnavailableReason === "CARD_FINGERPRINT_REUSED"
          ) {
            setOffer((current) =>
              current
                ? {
                    ...current,
                    yookassaTrialAvailable: false,
                    yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED",
                  }
                : current,
            );
            setReturnState("trial-unavailable");
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
        throw new Error("Не удалось создать платеж");
      }
      const data = await response.json();
      const url = data?.data?.confirmationUrl;
      if (typeof url === "string" && url.length > 0) {
        window.location.href = url;
        return;
      }
      throw new Error("Ссылка на оплату не получена");
    } catch (e) {
      reportClientError(e, {
        issueKey: "AppSubscriptionPaywall",
        keys: { operation: "start_yookassa_subscription" },
      });
      setError(e instanceof Error ? e.message : "Ошибка оплаты. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  const postRewardedJson = useCallback(
    async <T,>(url: string, body: unknown): Promise<T> => {
      const token = await ensureCsrfToken();
      if (!token) {
        throw new Error("Не удалось получить CSRF токен. Обновите страницу и попробуйте снова.");
      }
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { success?: boolean; data?: T; error?: string };
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Не удалось выполнить действие");
      }
      return json.data;
    },
    [ensureCsrfToken],
  );

  const onWatchRewardedAd = async () => {
    if (rewardedLoading || !rewardedStatus?.canWatchAd) return;
    setRewardedLoading(true);
    setRewardedMessage(null);
    setError(null);
    try {
      const platform = getWebRewardedPlatform();
      const session = await postRewardedJson<RewardedAdSession>("/api/v1/rewarded-ads/session", {
        platform,
      });
      await postRewardedJson<{ recorded: true }>("/api/v1/rewarded-ads/events", {
        sessionId: session.sessionId,
        eventType: "LOADED",
      });
      await postRewardedJson<{ recorded: true }>("/api/v1/rewarded-ads/events", {
        sessionId: session.sessionId,
        eventType: "SHOWN",
      });
      await renderYandexRewarded({
        blockId: session.placementId,
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        onEvent: (eventType) => {
          void postRewardedJson<{ recorded: true }>("/api/v1/rewarded-ads/events", {
            sessionId: session.sessionId,
            eventType,
          }).catch(() => undefined);
        },
        onGrant: async ({ sessionId, requestNonce }) => {
          await postRewardedJson<{ recorded: true }>("/api/v1/rewarded-ads/events", {
            sessionId,
            eventType: "REWARDED",
          });
          await postRewardedJson("/api/v1/rewarded-ads/grant", { sessionId, requestNonce });
          setRewardedMessage(
            onRewardedGrant
              ? "Кредиты начислены. Открываем материал."
              : "Кредиты начислены. Теперь можно открыть платный материал без подписки.",
          );
          await loadRewardedStatus();
          await onRewardedGrant?.();
        },
      });
    } catch (e) {
      reportClientError(e, {
        issueKey: "AppSubscriptionPaywall",
        keys: { operation: "watch_rewarded_ad" },
      });
      setRewardedMessage(e instanceof Error ? e.message : "Не удалось показать рекламу.");
    } finally {
      setRewardedLoading(false);
    }
  };

  const showRewardedBlock =
    rewardedStatus?.settings.platformEnabled && rewardedStatus.settings.paywallCtaEnabled;
  const rewardedUnavailableText = rewardedStatus
    ? getRewardedUnavailableText(rewardedStatus.canWatchAdReason)
    : "";
  const yookassaTrialUnavailableText = getYookassaTrialUnavailableText(offer);

  return (
    <section className={`${styles.page} ${mode === "embedded" ? styles.embedded : ""}`}>
      <div className={styles.inner}>
        {returnState === "success" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>{getYookassaReturnSuccessTitle(offer)}</h1>
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
        ) : returnState === "trial-unavailable" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>Пробный период недоступен</h1>
            <p className={styles.returnText}>
              {yookassaTrialUnavailableText ??
                "С этим способом оплаты пробный период уже использован. Premium можно подключить через обычную оплату."}
            </p>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={onStart}
              disabled={loading || csrfLoading || !selectedPlan}
            >
              {loading || csrfLoading ? "Переход в ЮKassa..." : "Оплатить Premium"}
            </button>
            {error ? (
              <p className={styles.errorText} role="alert">
                {error}
              </p>
            ) : null}
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
                <p className={styles.priceNote}>{getYookassaPriceNote(offer)}</p>
              </div>
            </div>

            {yookassaTrialUnavailableText ? (
              <p className={styles.errorText}>{yookassaTrialUnavailableText}</p>
            ) : null}

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
                          <span className={styles.planBadge}>
                            {plan.code === "MONTHLY" ? "30 дней" : "7 дней"}
                          </span>
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
              {loading || csrfLoading ? "Переход в ЮKassa..." : getYookassaPrimaryCta(offer)}
            </button>
            <p className={styles.legalText}>
              Нажимая кнопку, вы принимаете{" "}
              <a href="/oferta.html" target="_blank" rel="noopener noreferrer">
                Оферту
              </a>
              : {getYookassaLegalText(offer, selectedPriceText)}
            </p>
            <p className={styles.assurance}>
              Безопасная оплата через ЮKassa • Способ оплаты сохранится для автопродления
            </p>

            {showRewardedBlock ? (
              <div className={styles.rewardedBlock}>
                <div>
                  <p className={styles.rewardedTitle}>Доступ за просмотр рекламы</p>
                  <p className={styles.rewardedText}>
                    Посмотрите рекламу и получите{" "}
                    {rewardedStatus.nextGrantCredits || rewardedStatus.wallet.creditsPerReward}{" "}
                    кредитов. Их можно потратить на открытие статей, шагов в курсе или запись к
                    кинологу.
                  </p>
                  <p className={styles.rewardedBalance}>
                    Баланс: {rewardedStatus.wallet.balance}/{rewardedStatus.wallet.maxBalance}.
                  </p>
                  {rewardedUnavailableText ? (
                    <p className={styles.rewardedHint}>{rewardedUnavailableText}</p>
                  ) : null}
                  {rewardedMessage ? (
                    <p className={styles.rewardedHint}>{rewardedMessage}</p>
                  ) : null}
                </div>
                <button
                  className={styles.rewardedButton}
                  type="button"
                  onClick={onWatchRewardedAd}
                  disabled={rewardedLoading || !rewardedStatus.canWatchAd || csrfLoading}
                >
                  {rewardedLoading ? "Открываем рекламу..." : "Получить кредиты за рекламу"}
                </button>
              </div>
            ) : null}

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

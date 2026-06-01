"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "@/shared/lib/app-subscription/presentation";
import styles from "./app-subscription-paywall.module.css";

type AppSubscriptionOffer = {
  intervalDays: number;
  yookassaPriceRub: number;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: number;
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
  const [priceText, setPriceText] = useState("200 ₽/неделю");
  const [offer, setOffer] = useState<AppSubscriptionOffer | null>(null);
  const [returnState, setReturnState] = useState<"idle" | "checking" | "success" | "pending">("idle");
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
        const price = Number(response?.data?.yookassaPriceRub);
        const interval = Number(response?.data?.intervalDays);
        if (Number.isFinite(price) && Number.isFinite(interval) && price > 0 && interval > 0) {
          setPriceText(`${price} ₽/${interval === 7 ? "неделю" : `${interval} дн.`}`);
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
        body: JSON.stringify({}),
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

  return (
    <section className={`${styles.page} ${mode === "embedded" ? styles.embedded : ""}`}>
      <div className={styles.inner}>
        {returnState === "success" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>{getYookassaReturnSuccessTitle(offer)}</h1>
            <p className={styles.returnText}>
              Premium активен. Сейчас откроем список курсов.
            </p>
          </div>
        ) : returnState === "checking" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>Проверяем привязку карты</h1>
            <p className={styles.returnText}>
              Обычно это занимает несколько секунд после возврата из ЮKassa.
            </p>
          </div>
        ) : returnState === "pending" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>Привязка ещё подтверждается</h1>
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
              <p className={styles.priceLabel}>Текущий тариф</p>
              <p className={styles.price}>{priceText}</p>
              <p className={styles.priceNote}>{getYookassaPriceNote(offer)}</p>
            </div>
          </div>

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
            disabled={loading || csrfLoading}
          >
            {loading || csrfLoading ? "Переход в ЮKassa..." : getYookassaPrimaryCta(offer)}
          </button>
          <p className={styles.legalText}>
            Нажимая кнопку, вы принимаете{" "}
            <a href="/oferta.html" target="_blank" rel="noopener noreferrer">
              Оферту
            </a>
            : {getYookassaLegalText(offer, priceText)}
          </p>
          <p className={styles.assurance}>
            Безопасная привязка карты через ЮKassa • Чек придёт после первого списания
          </p>

          {showRewardedBlock ? (
            <div className={styles.rewardedBlock}>
              <div>
                <p className={styles.rewardedTitle}>Доступ за просмотр рекламы</p>
                <p className={styles.rewardedText}>
                  Посмотрите рекламу и получите{" "}
                  {rewardedStatus.nextGrantCredits ||
                    rewardedStatus.wallet.creditsPerReward} кредитов.
                  Их можно потратить на открытие статей, шагов в курсе или запись к кинологу.
                </p>
                <p className={styles.rewardedBalance}>
                  Баланс: {rewardedStatus.wallet.balance}/{rewardedStatus.wallet.maxBalance}.
                </p>
                {rewardedUnavailableText ? (
                  <p className={styles.rewardedHint}>{rewardedUnavailableText}</p>
                ) : null}
                {rewardedMessage ? <p className={styles.rewardedHint}>{rewardedMessage}</p> : null}
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

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCSRFStore } from "@gafus/csrf";
import { fetchAppSubscriptionOffer } from "@/shared/lib/app-subscription/client";
import styles from "./app-subscription-paywall.module.css";

export function AppSubscriptionPaywall() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceText, setPriceText] = useState("200 ₽/неделю");
  const [returnState, setReturnState] = useState<"idle" | "checking" | "success" | "pending">("idle");
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
      setError(e instanceof Error ? e.message : "Ошибка оплаты. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.inner}>
        {returnState === "success" ? (
          <div className={`${styles.card} ${styles.returnCard}`} role="status" aria-live="polite">
            <p className={styles.kicker}>Gafus Premium</p>
            <h1 className={styles.returnTitle}>Спасибо за подписку</h1>
            <p className={styles.returnText}>
              Оплата подтверждена. Сейчас откроем список курсов.
            </p>
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
              <p className={styles.priceNote}>Отмена автопродления в любой момент</p>
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
            {loading || csrfLoading ? "Переход к оплате..." : "Оформить подписку"}
          </button>
          <p className={styles.legalText}>
            Нажимая кнопку, вы принимаете{" "}
            <a href="/oferta.html" target="_blank" rel="noopener noreferrer">
              Оферту
            </a>
            : подписка продлевается автоматически, способ оплаты сохраняется в ЮKassa, а
            автопродление можно отключить в профиле в любой момент.
          </p>
          <p className={styles.assurance}>Безопасная оплата через ЮKassa • Электронный чек после оплаты</p>

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

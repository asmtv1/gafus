"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCSRFStore } from "@gafus/csrf";
import { PrimaryButton, SecondaryButton } from "@shared/components/ui";

import styles from "./partner.module.css";

type PartnerDashboardDto = {
  referralCode: string;
  referrals: number;
  earnedKopecks: number;
  reservedKopecks: number;
  availableKopecks: number;
};

function formatRubles(kopecks: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(kopecks / 100);
}

export default function PartnerDashboard() {
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [dashboard, setDashboard] = useState<PartnerDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [payoutPending, setPayoutPending] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/partners/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось загрузить кабинет партнёра");
      }
      setDashboard(json.data as PartnerDashboardDto);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить кабинет партнёра");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!csrfToken && !csrfLoading) void fetchToken();
  }, [csrfLoading, csrfToken, fetchToken]);

  const referralLink = useMemo(() => {
    if (!dashboard) return "";
    return `${window.location.origin}/register?promoCode=${encodeURIComponent(dashboard.referralCode)}`;
  }, [dashboard]);

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopyMessage("Ссылка скопирована");
    } catch {
      setCopyMessage("Не удалось скопировать ссылку. Скопируйте её из поля выше.");
    }
  };

  const requestPayout = async () => {
    const amountKopecks = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!csrfToken) {
      setPayoutMessage("Не удалось получить защитный токен. Обновите страницу.");
      return;
    }
    if (!Number.isSafeInteger(amountKopecks) || amountKopecks <= 0) {
      setPayoutMessage("Укажите сумму больше нуля.");
      return;
    }

    setPayoutPending(true);
    setPayoutMessage(null);
    try {
      const response = await fetch("/api/v1/partners/payouts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ amountKopecks }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось создать заявку на выплату");
      }
      setAmount("");
      setPayoutMessage("Заявка на выплату принята.");
      await loadDashboard();
    } catch (caught) {
      setPayoutMessage(
        caught instanceof Error ? caught.message : "Не удалось создать заявку на выплату",
      );
    } finally {
      setPayoutPending(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="partner-dashboard-title">
        <p className={styles.kicker}>Gafus Premium</p>
        <h1 id="partner-dashboard-title" className={styles.title}>Партнёрская программа</h1>
        <p className={styles.lede}>Приглашайте новых учеников и получайте вознаграждение за их оплаченные подписки.</p>

        {loading ? <p className={styles.info}>Загрузка кабинета...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {dashboard ? (
          <>
            <section className={styles.linkCard} aria-labelledby="partner-link-title">
              <h2 id="partner-link-title">Ваша ссылка для приглашения</h2>
              <p>Новый ученик зарегистрируется по ней, а приглашение закрепится за вами.</p>
              <div className={styles.linkControls}>
                <input className={styles.linkInput} value={referralLink} readOnly aria-label="Ваша партнёрская ссылка" />
                <SecondaryButton onClick={() => void copyReferralLink()}>Скопировать</SecondaryButton>
              </div>
              {copyMessage ? <p className={styles.feedback} role="status">{copyMessage}</p> : null}
            </section>

            <dl className={styles.stats}>
              <div><dt>Приглашено учеников</dt><dd>{dashboard.referrals}</dd></div>
              <div><dt>Начислено</dt><dd>{formatRubles(dashboard.earnedKopecks)}</dd></div>
              <div><dt>В заявках</dt><dd>{formatRubles(dashboard.reservedKopecks)}</dd></div>
              <div className={styles.available}><dt>Доступно к выплате</dt><dd>{formatRubles(dashboard.availableKopecks)}</dd></div>
            </dl>

            <section className={styles.payoutCard} aria-labelledby="partner-payout-title">
              <h2 id="partner-payout-title">Заявка на выплату</h2>
              <p>Укажите сумму в рублях. Мы свяжемся с вами для выплаты.</p>
              <div className={styles.payoutControls}>
                <label className={styles.amountLabel} htmlFor="partner-payout-amount">Сумма, ₽</label>
                <input
                  id="partner-payout-amount"
                  className={styles.amountInput}
                  value={amount}
                  inputMode="decimal"
                  placeholder="Например, 500"
                  onChange={(event) => setAmount(event.target.value)}
                />
                <PrimaryButton disabled={payoutPending || csrfLoading || dashboard.availableKopecks <= 0} onClick={() => void requestPayout()}>
                  {payoutPending ? "Отправляем..." : "Запросить выплату"}
                </PrimaryButton>
              </div>
              {payoutMessage ? <p className={styles.feedback} role="status">{payoutMessage}</p> : null}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

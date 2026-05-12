"use client";

import { useEffect, useMemo, useState } from "react";
import { useCSRFStore } from "@gafus/csrf";
import type { UserWithTrainings } from "@gafus/types";

import TrainingReminders from "../TrainingReminders";
import styles from "./PrivateProfileSection.module.css";

interface PrivateProfileSectionProps {
  user: UserWithTrainings;
}

type AppSubscriptionStatusDto = {
  hasActiveSubscription: boolean;
  paidAt: string | null;
  activeUntil: string | null;
  isLifetime: boolean;
  provider: "YOOKASSA" | "APPLE" | "MANUAL" | null;
  status: "ACTIVE" | "PENDING" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "REFUNDED" | "REVOKED" | null;
  cancelAtPeriodEnd: boolean;
  hasSavedPaymentMethod: boolean;
  paymentMethodLast4: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
};

function formatMskDateTime(dateIso: string | null): string {
  if (!dateIso) return "—";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date)} МСК`;
}

export default function PrivateProfileSection({ user: _user }: PrivateProfileSectionProps) {
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [status, setStatus] = useState<AppSubscriptionStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detachChecked, setDetachChecked] = useState(false);
  const [detachLoading, setDetachLoading] = useState(false);
  const [detachMessage, setDetachMessage] = useState<string | null>(null);
  const [bindLoading, setBindLoading] = useState(false);

  useEffect(() => {
    if (!csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [csrfToken, csrfLoading, fetchToken]);

  useEffect(() => {
    const loadStatus = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/v1/app-subscription/status", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(json?.error ?? "Не удалось загрузить данные подписки");
        }
        setStatus(json.data as AppSubscriptionStatusDto);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить данные подписки");
      } finally {
        setLoading(false);
      }
    };

    void loadStatus();
  }, []);

  const nextChargeDate = useMemo(() => {
    if (!status?.hasActiveSubscription || status.isLifetime) return null;
    if (status.provider !== "YOOKASSA") return null;
    if (!status.hasSavedPaymentMethod) return null;
    if (status.cancelAtPeriodEnd) return null;
    return status.nextChargeAt;
  }, [status]);

  const canDetachCard =
    status?.hasActiveSubscription &&
    status.provider === "YOOKASSA" &&
    status.hasSavedPaymentMethod &&
    !status.cancelAtPeriodEnd;

  const canBindCard =
    status?.hasActiveSubscription &&
    status.provider === "YOOKASSA" &&
    !status.hasSavedPaymentMethod;

  const handleDetachCard = async () => {
    if (!csrfToken) {
      setDetachMessage("Не удалось получить CSRF токен. Обновите страницу.");
      return;
    }

    setDetachLoading(true);
    setDetachMessage(null);
    try {
      const response = await fetch("/api/v1/app-subscription/yookassa/cancel", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({}),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось отключить автопродление");
      }
      setStatus(json.data as AppSubscriptionStatusDto);
      setDetachChecked(false);
      setDetachMessage("Карта отвязана, автопродление отключено.");
    } catch (e) {
      setDetachMessage(e instanceof Error ? e.message : "Ошибка при отвязке карты");
    } finally {
      setDetachLoading(false);
    }
  };

  const handleBindCard = async () => {
    if (!csrfToken) {
      setDetachMessage("Не удалось получить CSRF токен. Обновите страницу.");
      return;
    }

    setBindLoading(true);
    setDetachMessage(null);
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
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось создать платеж");
      }
      const confirmationUrl = json?.data?.confirmationUrl;
      if (typeof confirmationUrl !== "string" || confirmationUrl.length === 0) {
        throw new Error("Ссылка на оплату не получена");
      }
      window.location.href = confirmationUrl;
    } catch (e) {
      setDetachMessage(e instanceof Error ? e.message : "Ошибка при привязке карты");
    } finally {
      setBindLoading(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.remindersBlock}>
        <TrainingReminders />
      </div>

      <section className={styles.subscriptionCard} aria-labelledby="subscription-card-title">
        <div className={styles.subscriptionHeader}>
          <h2 id="subscription-card-title" className={styles.subscriptionTitle}>
            Подписка Gafus Premium
          </h2>
          {status?.hasActiveSubscription ? (
            <span className={styles.statusActive}>Активна</span>
          ) : (
            <span className={styles.statusInactive}>Неактивна</span>
          )}
        </div>

        {loading ? <p className={styles.subscriptionText}>Загрузка подписки...</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}

        {!loading && !error && status ? (
          <>
            <dl className={styles.metaGrid}>
              <div>
                <dt>Оплачено</dt>
                <dd>{formatMskDateTime(status.paidAt)}</dd>
              </div>
              <div>
                <dt>Следующее списание</dt>
                <dd>
                  {nextChargeDate ? formatMskDateTime(nextChargeDate) : status.cancelAtPeriodEnd ? "Отключено" : "—"}
                </dd>
              </div>
              <div>
                <dt>Карта оплаты</dt>
                <dd>
                  {status.paymentMethodLast4
                    ? `•••• ${status.paymentMethodLast4}`
                    : status.paymentMethodTitle ?? "—"}
                </dd>
              </div>
            </dl>

            {status.hasActiveSubscription && status.provider === "YOOKASSA" && !status.hasSavedPaymentMethod ? (
              <p className={styles.subscriptionText}>
                Чтобы снова включить автопродление, оплатите следующую неделю подписки. Мы спишем стоимость тарифа сейчас,
                добавим оплаченный период к текущему доступу и сохраним карту для следующих списаний.
              </p>
            ) : null}

            {canBindCard ? (
              <button
                type="button"
                className={styles.bindButton}
                disabled={bindLoading || csrfLoading}
                onClick={handleBindCard}
              >
                {bindLoading ? "Переход к оплате..." : "Продлить и привязать карту"}
              </button>
            ) : null}

            {canDetachCard ? (
              <div className={styles.detachBlock}>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={detachChecked}
                    onChange={(event) => setDetachChecked(event.target.checked)}
                  />
                  <span>
                    Подтверждаю отвязку карты и отключение автоплатежей по подписке.
                  </span>
                </label>

                <button
                  type="button"
                  className={styles.detachButton}
                  disabled={!detachChecked || detachLoading || csrfLoading}
                  onClick={handleDetachCard}
                >
                  {detachLoading ? "Удаляем карту..." : "Удалить карту"}
                </button>
              </div>
            ) : null}

            {detachMessage ? <p className={styles.subscriptionText}>{detachMessage}</p> : null}
          </>
        ) : null}
      </section>
    </section>
  );
}

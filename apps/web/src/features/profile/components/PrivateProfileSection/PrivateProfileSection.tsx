"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";
import { reportClientError } from "@gafus/error-handling";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCSRFStore } from "@gafus/csrf";
import type { UserWithTrainings } from "@gafus/types";

import Image from "next/image";
import { PrimaryButtonLink } from "@/shared/components/ui";
import { ProfileIcon } from "../ProfileIcon";
import styles from "./PrivateProfileSection.module.css";

interface PrivateProfileSectionProps {
  user: UserWithTrainings;
}

type AppSubscriptionStatusDto = {
  hasActiveSubscription: boolean;
  paidAt: string | null;
  activeUntil: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  isLifetime: boolean;
  provider: "YOOKASSA" | "APPLE" | "MANUAL" | null;
  planCode: "WEEKLY" | "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS" | null;
  status:
    | "ACTIVE"
    | "PENDING"
    | "PAST_DUE"
    | "CANCELED"
    | "EXPIRED"
    | "REFUNDED"
    | "REVOKED"
    | null;
  cancelAtPeriodEnd: boolean;
  hasSavedPaymentMethod: boolean;
  paymentMethodLast4: string | null;
  paymentMethodTitle: string | null;
  nextChargeAt: string | null;
  yookassaTrialAvailable: boolean;
  yookassaTrialDays: 3;
  yookassaTrialUnavailableReason: "CARD_FINGERPRINT_REUSED" | null;
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

export default function PrivateProfileSection({ user }: PrivateProfileSectionProps) {
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [status, setStatus] = useState<AppSubscriptionStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detachChecked, setDetachChecked] = useState(false);
  const [detachLoading, setDetachLoading] = useState(false);
  const [detachMessage, setDetachMessage] = useState<string | null>(null);
  const actionInFlight = useRef(false);
  const [revision, setRevision] = useState(0);
  const [bindLoading, setBindLoading] = useState(false);

  useEffect(() => {
    if (!csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [csrfToken, csrfLoading, fetchToken]);

  useEffect(() => {
    const controller = new AbortController();
    const loadStatus = async () => {
      setLoading(true);
      setStatus(null);
      setError(null);
      try {
        const response = await fetch("/api/v1/app-subscription/status", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(json?.error ?? "Не удалось загрузить данные подписки");
        }
        if (!controller.signal.aborted) setStatus(json.data as AppSubscriptionStatusDto);
      } catch (e) {
        if (!controller.signal.aborted)
          reportClientError(e, {
            issueKey: "PrivateProfileSection",
            keys: { operation: "load_status" },
          });
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Не удалось загрузить данные подписки");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadStatus();
    return () => controller.abort();
  }, [revision, user.id]);

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
    if (actionInFlight.current || !detachChecked || !canDetachCard) return;
    if (!csrfToken) {
      setDetachMessage("Не удалось получить CSRF токен. Обновите страницу.");
      return;
    }

    actionInFlight.current = true;
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
        body: JSON.stringify({ planCode: status?.planCode ?? "WEEKLY" }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось отключить автопродление");
      }
      setStatus(json.data as AppSubscriptionStatusDto);
      setDetachChecked(false);
      setDetachMessage("Способ оплаты отвязан, автопродление отключено.");
    } catch (e) {
      reportClientError(e, {
        issueKey: "PrivateProfileSection",
        keys: { operation: "subscription_action" },
      });
      setDetachMessage(e instanceof Error ? e.message : "Ошибка при отвязке способа оплаты");
    } finally {
      actionInFlight.current = false;
      setDetachLoading(false);
    }
  };

  const handleBindCard = async () => {
    if (actionInFlight.current || !canBindCard) return;
    if (!csrfToken) {
      setDetachMessage("Не удалось получить CSRF токен. Обновите страницу.");
      return;
    }

    actionInFlight.current = true;
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
        throw new Error(json?.error ?? "Не удалось сохранить способ оплаты");
      }
      const confirmationUrl = json?.data?.confirmationUrl;
      if (typeof confirmationUrl !== "string" || confirmationUrl.length === 0) {
        throw new Error("Ссылка ЮKassa не получена");
      }
      window.location.href = confirmationUrl;
    } catch (e) {
      reportClientError(e, {
        issueKey: "PrivateProfileSection",
        keys: { operation: "subscription_action" },
      });
      setDetachMessage(e instanceof Error ? e.message : "Ошибка сохранения способа оплаты");
    } finally {
      actionInFlight.current = false;
      setBindLoading(false);
    }
  };

  return (
    <section className={styles.section}>
      <section className={styles.subscriptionCard} aria-labelledby="subscription-card-title">
        <div className={styles.subscriptionHeader}>
          <ProfileIcon name="premium" />
          <h2 id="subscription-card-title" className={styles.subscriptionTitle}>
            Подписка Gafus Premium
          </h2>
          {!loading &&
            !error &&
            (status?.hasActiveSubscription ? (
              <span className={styles.statusActive}>Активна</span>
            ) : (
              <span className={styles.statusInactive}>Неактивна</span>
            ))}
        </div>

        {loading ? <LoadingState variant="inline" size="small" message="Загрузка подписки…" /> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}

        {!loading && !error && status ? (
          <>
            {!status.hasActiveSubscription ? (
              <>
                <p className={styles.subscriptionText}>
                  Откройте больше возможностей для вас и вашего питомца.
                </p>
                <ul className={styles.benefits}>
                  {[
                    "Все курсы и тренировки",
                    "Консультации с кинологом",
                    "Документы питомца",
                    "Эксклюзивные материалы",
                  ].map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
                <Image
                  src="/images/profile-premium-mascot.webp"
                  alt=""
                  width={280}
                  height={180}
                  className={styles.subscriptionArt}
                />
                <PrimaryButtonLink href="/subscription" fullWidth>
                  Оформить подписку
                </PrimaryButtonLink>
              </>
            ) : status.provider === "MANUAL" &&
              status.isLifetime &&
              status.paymentMethodTitle === "Партнёрская программа" ? (
              <p className={styles.subscriptionText}>
                Бесплатный бессрочный доступ участника партнёрской программы.
              </p>
            ) : (
              <dl className={styles.metaGrid}>
                <div>
                  <dt>{status.isTrial ? "Пробный период до" : "Оплачено"}</dt>
                  <dd>{formatMskDateTime(status.isTrial ? status.trialEndsAt : status.paidAt)}</dd>
                </div>
                <div>
                  <dt>Следующее списание</dt>
                  <dd>
                    {nextChargeDate
                      ? formatMskDateTime(nextChargeDate)
                      : status.provider === "APPLE"
                        ? "Управляется в App Store"
                        : status.cancelAtPeriodEnd
                          ? "Отключено"
                          : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Способ оплаты</dt>
                  <dd>
                    {status.paymentMethodLast4
                      ? `•••• ${status.paymentMethodLast4}`
                      : (status.paymentMethodTitle ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt>Доступ до</dt>
                  <dd>{status.isLifetime ? "Бессрочно" : formatMskDateTime(status.activeUntil)}</dd>
                </div>
              </dl>
            )}

            {status.hasActiveSubscription &&
            status.provider === "YOOKASSA" &&
            !status.hasSavedPaymentMethod ? (
              <p className={styles.subscriptionText}>
                Чтобы снова включить автопродление, сохраните способ оплаты через ЮKassa. Следующее
                списание произойдёт по дате подписки.
              </p>
            ) : null}

            {canBindCard ? (
              <button
                type="button"
                className={styles.bindButton}
                disabled={bindLoading || csrfLoading}
                onClick={handleBindCard}
              >
                {bindLoading ? "Переход в ЮKassa..." : "Сохранить способ оплаты"}
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
                    Подтверждаю отвязку способа оплаты и отключение автоплатежей по подписке.
                  </span>
                </label>

                <button
                  type="button"
                  className={styles.detachButton}
                  disabled={!detachChecked || detachLoading || csrfLoading}
                  onClick={handleDetachCard}
                >
                  {detachLoading ? "Удаляем..." : "Удалить способ оплаты"}
                </button>
              </div>
            ) : null}

            {detachMessage ? <p className={styles.subscriptionText}>{detachMessage}</p> : null}
          </>
        ) : null}
        <button
          type="button"
          className={styles.refreshButton}
          disabled={loading || detachLoading || bindLoading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Обновить статус
        </button>
      </section>
    </section>
  );
}

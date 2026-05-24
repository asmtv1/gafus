"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import {
  formatConsultationListDateTimeMsk,
  type ConsultationBookingDto,
} from "@gafus/consultation-shared";

import { getConsultationBookingStatusPresentation } from "../lib/consultation-booking-status-ru";

import styles from "./my-consultations-client.module.css";

interface MyConsultationsClientProps {
  initialItems: ConsultationBookingDto[];
}

/**
 * Список броней пользователя с отменой через CSRF.
 */
export function MyConsultationsClient({ initialItems }: MyConsultationsClientProps) {
  const router = useRouter();
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!csrfToken) void fetchToken();
  }, [csrfToken, fetchToken]);

  const handleCancel = useCallback(
    (bookingId: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          try {
            if (!csrfToken) await fetchToken();
            const token = csrfToken ?? useCSRFStore.getState().token;
            if (!token) {
              setError("Нет CSRF-токена");
              return;
            }
            const res = await fetch(
              `/api/v1/consultations/bookings/${encodeURIComponent(bookingId)}/cancel`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-csrf-token": token,
                },
                credentials: "include",
                body: JSON.stringify({}),
              },
            );
            const json = (await res.json()) as { success?: boolean; error?: string };
            if (!res.ok || !json.success) {
              setError(json.error ?? "Не удалось отменить");
              return;
            }
            router.refresh();
          } catch (e) {
            reportClientError(e instanceof Error ? e : new Error(String(e)), {
              issueKey: "consultation",
              keys: { operation: "cancel" },
            });
            setError("Ошибка отмены");
          }
        })();
      });
    },
    [csrfToken, fetchToken, router],
  );

  const canCancel = (status: string) =>
    status === "PENDING_TRAINER_CONFIRMATION" || status === "CONFIRMED";

  return (
    <div className={styles.wrap}>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      <p className={styles.hint}>Все консультации отображаются по времени МСК (UTC+3).</p>
      {initialItems.length === 0 ? (
        <div className={styles.empty}>
          <p>Пока нет записей. Выберите кинолога в каталоге и забронируйте удобное время.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {initialItems.map((b) => {
            const pres = getConsultationBookingStatusPresentation(b.status, {
              cancelReason: b.cancelReason,
            });
            return (
              <li key={b.id} className={styles.card}>
                <div className={styles.statusRow}>
                  <span className={styles.badge} data-tone={pres.tone}>
                    {pres.badge}
                  </span>
                </div>
                <p className={styles.description}>{pres.description}</p>
                {pres.cancelReason ? (
                  <p className={styles.cancelReason}>
                    <span className={styles.cancelReasonLabel}>Комментарий кинолога: </span>
                    {pres.cancelReason}
                  </p>
                ) : null}
                <p className={styles.titleLine}>
                  {b.cynologistDisplayName ?? "Кинолог"} — {formatConsultationListDateTimeMsk(b.slot.startAtUtc)}
                </p>
                {b.clientOwnerName?.trim() || b.petName?.trim() ? (
                  <p className={styles.intakeShort}>
                    {[b.clientOwnerName?.trim(), b.petName?.trim()].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {(b.status === "CONFIRMED" || b.status === "COMPLETED") && b.joinUrl ? (
                  <p className={styles.joinLink}>
                    <a href={b.joinUrl} target="_blank" rel="noopener noreferrer">
                      Перейти к видеовстрече
                    </a>
                  </p>
                ) : null}
                {canCancel(b.status) ? (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    disabled={pending}
                    onClick={() => handleCancel(b.id)}
                  >
                    Отменить запись
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

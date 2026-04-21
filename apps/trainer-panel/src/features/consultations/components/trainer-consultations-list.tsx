"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Chip } from "@mui/material";

import type { ConsultationBookingDto } from "@gafus/core";
import type { ConsultationBookingStatus } from "@gafus/prisma";
import { reportClientError } from "@gafus/error-handling";

import {
  confirmBookingTrainerAction,
  rejectBookingTrainerAction,
} from "../lib/trainer-booking-actions";

import styles from "./trainer-consultations-list.module.css";

const BOOKING_STATUS_LABEL: Record<ConsultationBookingStatus, string> = {
  PENDING_TRAINER_CONFIRMATION: "Ожидает подтверждения",
  CONFIRMED: "Подтверждена",
  CANCELLED_BY_TRAINER: "Отклонена вами",
  CANCELLED_BY_USER: "Отменена клиентом",
  CANCELLED_BY_SLA: "Отменена (истекло время)",
  CANCELLED_BY_SYSTEM: "Отменена системой",
  COMPLETED: "Завершена",
  NO_SHOW: "Неявка",
};

interface TrainerConsultationsListProps {
  bookings: ConsultationBookingDto[];
}

function statusChipColor(
  status: ConsultationBookingStatus,
): "default" | "primary" | "success" | "warning" | "error" {
  switch (status) {
    case "PENDING_TRAINER_CONFIRMATION":
      return "warning";
    case "CONFIRMED":
      return "success";
    case "COMPLETED":
      return "primary";
    case "CANCELLED_BY_TRAINER":
    case "CANCELLED_BY_USER":
    case "CANCELLED_BY_SLA":
    case "CANCELLED_BY_SYSTEM":
      return "default";
    case "NO_SHOW":
      return "error";
    default:
      return "default";
  }
}

/**
 * Список заявок с кнопками подтверждения/отклонения для статуса ожидания тренера.
 */
export function TrainerConsultationsList({ bookings }: TrainerConsultationsListProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleConfirm = useCallback(
    (bookingId: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          const res = await confirmBookingTrainerAction(bookingId);
          if (!res.success) {
            setError(res.error);
            return;
          }
          router.refresh();
        })().catch((e) => {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "TrainerConsultations",
            keys: { operation: "confirm" },
          });
          setError("Ошибка подтверждения");
        });
      });
    },
    [router],
  );

  const handleReject = useCallback(
    (bookingId: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          const res = await rejectBookingTrainerAction(bookingId);
          if (!res.success) {
            setError(res.error);
            return;
          }
          router.refresh();
        })().catch((e) => {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "TrainerConsultations",
            keys: { operation: "reject" },
          });
          setError("Ошибка отклонения");
        });
      });
    },
    [router],
  );

  if (bookings.length === 0) {
    return <p className={styles.empty}>Пока нет заявок на консультации.</p>;
  }

  return (
    <div className={styles.root}>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      {bookings.map((b) => {
        const status = b.status as ConsultationBookingStatus;
        const pendingTrainer = status === "PENDING_TRAINER_CONFIRMATION";

        return (
          <Box
            key={b.id}
            className={`${styles.card} ${pendingTrainer ? styles.cardPending : ""}`}
          >
            <div className={styles.row}>
              <Chip
                label={BOOKING_STATUS_LABEL[status] ?? status}
                size="small"
                color={statusChipColor(status)}
                variant={pendingTrainer ? "filled" : "outlined"}
                sx={{ fontWeight: 600 }}
              />
              <p className={styles.meta}>
                Слот: {new Date(b.slot.startAtUtc).toLocaleString("ru-RU")} — подтвердить до{" "}
                {new Date(b.confirmationDeadlineAt).toLocaleString("ru-RU")}
              </p>
            </div>
            {b.clientProblem ? (
              <p className={styles.meta}>Проблема клиента: {b.clientProblem}</p>
            ) : null}
            {b.joinUrl && (status === "CONFIRMED" || status === "COMPLETED") ? (
              <p className={styles.meetingLink}>
                <a href={b.joinUrl} target="_blank" rel="noopener noreferrer">
                  Перейти к видеовстрече
                </a>
              </p>
            ) : null}
            {pendingTrainer ? (
              <div className={styles.actions}>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={pending}
                  onClick={() => handleConfirm(b.id)}
                >
                  Подтвердить
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={pending}
                  onClick={() => handleReject(b.id)}
                >
                  Отклонить
                </Button>
              </div>
            ) : null}
          </Box>
        );
      })}
    </div>
  );
}

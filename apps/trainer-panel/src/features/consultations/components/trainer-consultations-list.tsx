"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import {
  getConsultationBookingStatusGroup,
  getConsultationBookingStatusPresentation,
  type ConsultationBookingDto,
  formatConsultationPetGenderRu,
  formatRuPhoneForDisplay,
} from "@gafus/consultation-shared";

import { reportClientError } from "@gafus/error-handling";
import type { ConsultationBookingStatus } from "@gafus/prisma";

import {
  completeBookingTrainerAction,
  confirmBookingTrainerAction,
  markNoShowBookingTrainerAction,
  rejectBookingTrainerAction,
} from "../lib/trainer-booking-actions";

import styles from "./trainer-consultations-list.module.css";

const REJECT_REASON_MAX = 500;

interface TrainerConsultationsListProps {
  bookings: ConsultationBookingDto[];
}

type TrainerBookingFilter = "CONFIRMED" | "COMPLETED" | "CANCELLED";

const FILTER_LABEL: Record<TrainerBookingFilter, string> = {
  CONFIRMED: "Подтверждена",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
};

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
  const [filter, setFilter] = useState<TrainerBookingFilter>("CONFIRMED");
  const [rejectDialog, setRejectDialog] = useState<{
    bookingId: string;
    variant: "pending" | "confirmed";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  const handleComplete = useCallback(
    (bookingId: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          const res = await completeBookingTrainerAction(bookingId);
          if (!res.success) {
            setError(res.error);
            return;
          }
          router.refresh();
        })().catch((e) => {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "TrainerConsultations",
            keys: { operation: "complete" },
          });
          setError("Ошибка завершения консультации");
        });
      });
    },
    [router],
  );

  const handleNoShow = useCallback(
    (bookingId: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          const res = await markNoShowBookingTrainerAction(bookingId);
          if (!res.success) {
            setError(res.error);
            return;
          }
          router.refresh();
        })().catch((e) => {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "TrainerConsultations",
            keys: { operation: "no_show" },
          });
          setError("Ошибка выставления неявки");
        });
      });
    },
    [router],
  );

  const openRejectDialog = useCallback(
    (bookingId: string, variant: "pending" | "confirmed") => {
      setError(null);
      setRejectReason("");
      setRejectDialog({ bookingId, variant });
    },
    [],
  );

  const closeRejectDialog = useCallback(() => {
    if (!pending) {
      setRejectDialog(null);
      setRejectReason("");
    }
  }, [pending]);

  const submitReject = useCallback(() => {
    if (!rejectDialog) return;
    const len = rejectReason.length;
    if (len > REJECT_REASON_MAX) {
      setError(`Не длиннее ${REJECT_REASON_MAX} символов.`);
      return;
    }
    setError(null);
    const { bookingId, variant } = rejectDialog;
    const reason = rejectReason.trim();
    startTransition(() => {
      void (async () => {
        const res = await rejectBookingTrainerAction(bookingId, reason || undefined);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setRejectDialog(null);
        setRejectReason("");
        router.refresh();
      })().catch((e) => {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "TrainerConsultations",
          keys: { operation: "reject" },
        });
        setError(variant === "pending" ? "Ошибка отклонения" : "Ошибка отмены");
      });
    });
  }, [rejectDialog, rejectReason, router]);

  const visibleBookings = useMemo(() => {
    const pendingBookings = bookings.filter((b) => b.status === "PENDING_TRAINER_CONFIRMATION");

    const filtered = bookings.filter((b) => {
      if (b.status === "PENDING_TRAINER_CONFIRMATION") {
        return false;
      }
      if (filter === "CONFIRMED") {
        return b.status === "CONFIRMED";
      }
      if (filter === "COMPLETED") {
        return b.status === "COMPLETED";
      }
      const group = getConsultationBookingStatusGroup(b.status);
      return group === "CANCELLED" || group === "NO_SHOW";
    });

    return [...pendingBookings, ...filtered];
  }, [bookings, filter]);

  if (bookings.length === 0) {
    return <p className={styles.empty}>Пока нет заявок на консультации.</p>;
  }

  return (
    <div className={styles.root}>
      <Dialog
        open={rejectDialog != null}
        onClose={closeRejectDialog}
        fullWidth
        maxWidth="sm"
        aria-labelledby="consultation-reject-title"
      >
        <DialogTitle id="consultation-reject-title">
          {rejectDialog?.variant === "confirmed" ? "Отменить встречу?" : "Отклонить заявку?"}
        </DialogTitle>
        <DialogContent>
          <p className={styles.dialogHint}>
            {rejectDialog?.variant === "confirmed"
              ? "Клиент получит письмо. По желанию кратко укажите причину (например, форс-мажор) — она сохранится в заявке."
              : "По желанию укажите причину — она сохранится в заявке и пригодится в поддержке."}
          </p>
          <TextField
            autoFocus
            margin="dense"
            label="Комментарий (необязательно)"
            fullWidth
            multiline
            minRows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            inputProps={{ maxLength: REJECT_REASON_MAX, "aria-describedby": "reject-reason-hint" }}
            id="reject-reason"
          />
          <p id="reject-reason-hint" className={styles.charHint}>
            {rejectReason.length} / {REJECT_REASON_MAX}
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeRejectDialog} disabled={pending}>
            Назад
          </Button>
          <Button
            onClick={submitReject}
            color="error"
            variant="contained"
            disabled={pending}
          >
            {rejectDialog?.variant === "confirmed" ? "Отменить встречу" : "Отклонить"}
          </Button>
        </DialogActions>
      </Dialog>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      <div className={styles.filters}>
        {(Object.keys(FILTER_LABEL) as TrainerBookingFilter[]).map((filterKey) => (
          <Button
            key={filterKey}
            size="small"
            variant={filter === filterKey ? "contained" : "outlined"}
            onClick={() => setFilter(filterKey)}
          >
            {FILTER_LABEL[filterKey]}
          </Button>
        ))}
      </div>
      {visibleBookings.length === 0 ? (
        <p className={styles.empty}>По выбранному фильтру заявок нет.</p>
      ) : null}
      {visibleBookings.map((b) => {
        const status = b.status as ConsultationBookingStatus;
        const pendingTrainer = status === "PENDING_TRAINER_CONFIRMATION";
        const confirmed = status === "CONFIRMED";
        const slotStartLabel = new Date(b.slot.startAtUtc).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        });

        return (
          <Box
            key={b.id}
            className={`${styles.card} ${pendingTrainer ? styles.cardPending : ""}`}
          >
            <div className={styles.row}>
              <Chip
                label={getConsultationBookingStatusPresentation(status, {
                  cancelReason: b.cancelReason,
                }).badge}
                size="small"
                color={statusChipColor(status)}
                variant={pendingTrainer ? "filled" : "outlined"}
                sx={{ fontWeight: 600 }}
              />
              <p className={styles.meta}>
                Слот: {slotStartLabel}
                {pendingTrainer
                  ? ` — подтвердить до ${new Date(
                      b.confirmationDeadlineAt,
                    ).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`
                  : null}
                {confirmed ? " (московское время)" : null}
              </p>
            </div>
            <div className={styles.intakeBlock}>
              <p className={styles.intakeTitle}>Данные заявки</p>
              <p className={styles.meta}>
                <span className={styles.intakeField}>Ник в «Гафусе»: </span>
                {b.clientUsername?.trim() || "—"}
              </p>
              <p className={styles.meta}>
                <span className={styles.intakeField}>Владелец: </span>
                {b.clientOwnerName?.trim() || "—"}
              </p>
              <p className={styles.meta}>
                <span className={styles.intakeField}>Телефон: </span>
                {b.clientPhone ? formatRuPhoneForDisplay(b.clientPhone) : "—"}
              </p>
              <p className={styles.meta}>
                <span className={styles.intakeField}>Питомец: </span>
                {b.petName?.trim() || "—"} ({formatConsultationPetGenderRu(b.petGender)})
                {b.petAge?.trim() ? `, ${b.petAge.trim()}` : ""}
                {b.petBreed?.trim() ? `, ${b.petBreed.trim()}` : ""}
              </p>
              {b.clientProblem?.trim() ? (
                <p className={styles.meta}>
                  <span className={styles.intakeField}>Проблема: </span>
                  {b.clientProblem.trim()}
                </p>
              ) : (
                <p className={styles.meta}>Проблема: —</p>
              )}
              {b.clientSelfHelpAttempt?.trim() ? (
                <p className={styles.meta}>
                  <span className={styles.intakeField}>Самостоятельные попытки: </span>
                  {b.clientSelfHelpAttempt.trim()}
                </p>
              ) : (
                <p className={styles.meta}>Самостоятельные попытки: —</p>
              )}
            </div>
            {status === "CANCELLED_BY_TRAINER" && b.cancelReason?.trim() ? (
              <p className={styles.cancelReason}>
                <span className={styles.cancelReasonLabel}>Комментарий при отклонении: </span>
                {b.cancelReason.trim()}
              </p>
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
                  onClick={() => openRejectDialog(b.id, "pending")}
                >
                  Отклонить
                </Button>
              </div>
            ) : null}
            {confirmed ? (
              <div className={styles.actions}>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  disabled={pending}
                  onClick={() => handleComplete(b.id)}
                >
                  Завершить
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={pending}
                  onClick={() => handleNoShow(b.id)}
                >
                  Не состоялась
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={pending}
                  onClick={() => openRejectDialog(b.id, "confirmed")}
                >
                  Отменить встречу
                </Button>
              </div>
            ) : null}
          </Box>
        );
      })}
    </div>
  );
}

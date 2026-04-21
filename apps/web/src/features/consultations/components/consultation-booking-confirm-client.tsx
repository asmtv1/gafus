"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { useRouter } from "next/navigation";

import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";

import { showErrorAlert } from "@shared/utils/sweetAlert";

import styles from "./consultation-booking-confirm-client.module.css";

const SLOT_TAKEN_MESSAGE =
  "Извините, этот слот уже занят. Выберите другое время.";

interface ConsultationBookingConfirmClientProps {
  slotId: string;
  cynologistUserId: string;
  cynologistName: string;
  startAtUtc?: string;
  endAtUtc?: string;
}

interface BookResponse {
  success?: boolean;
  data?: { kind: string; booking?: { id: string } };
  error?: string;
  code?: string;
}

const CONSULTATION_TIMEZONE = "Europe/Moscow";

function formatSlot(startAtUtc?: string, endAtUtc?: string): string {
  if (!startAtUtc || !endAtUtc) {
    return "Время будет подтверждено при бронировании";
  }
  const start = new Date(startAtUtc);
  const end = new Date(endAtUtc);
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(start);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CONSULTATION_TIMEZONE,
  });
  return `${date}, ${time.format(start)} - ${time.format(end)} (МСК)`;
}

export function ConsultationBookingConfirmClient({
  slotId,
  cynologistUserId,
  cynologistName,
  startAtUtc,
  endAtUtc,
}: ConsultationBookingConfirmClientProps) {
  const router = useRouter();
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [clientProblem, setClientProblem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState<string>(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );

  const slotLabel = useMemo(() => formatSlot(startAtUtc, endAtUtc), [startAtUtc, endAtUtc]);

  const slotsHref = `/consultations/${encodeURIComponent(cynologistUserId)}`;

  const handleSlotUnavailable = useCallback(async () => {
    await showErrorAlert(SLOT_TAKEN_MESSAGE);
    router.push(slotsHref);
  }, [router, slotsHref]);

  const handleSubmit = useCallback(() => {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const verifyRes = await fetch(
            `/api/v1/consultations/cynologists/${encodeURIComponent(cynologistUserId)}/slots/${encodeURIComponent(slotId)}/verify`,
            { credentials: "include", method: "GET" },
          );
          if (!verifyRes.ok) {
            if (verifyRes.status === 409 || verifyRes.status === 404) {
              await handleSlotUnavailable();
              return;
            }
            const vJson = (await verifyRes.json().catch(() => ({}))) as { error?: string };
            setError(vJson.error ?? "Не удалось проверить слот");
            return;
          }

          if (!csrfToken) {
            await fetchToken();
          }
          const token = csrfToken ?? useCSRFStore.getState().token;
          if (!token) {
            setError("Нет CSRF-токена");
            return;
          }
          const res = await fetch("/api/v1/consultations/book", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": token,
            },
            credentials: "include",
            body: JSON.stringify({
              slotId,
              idempotencyKey,
              clientProblem: clientProblem.trim() || undefined,
            }),
          });
          const json = (await res.json()) as BookResponse;
          if (!res.ok || !json.success) {
            if (res.status === 409 || json.code === "CONSULTATION_SLOT_TAKEN") {
              await handleSlotUnavailable();
              return;
            }
            setError(json.error ?? "Не удалось забронировать");
            return;
          }
          router.push("/consultations/my");
        } catch (e) {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "consultation",
            keys: { operation: "confirmBooking" },
          });
          setError("Ошибка бронирования");
        }
      })();
    });
  }, [
    clientProblem,
    csrfToken,
    cynologistUserId,
    fetchToken,
    handleSlotUnavailable,
    idempotencyKey,
    router,
    slotId,
  ]);

  return (
    <Box className={styles.card}>
      <Stack spacing={2.25}>
        <div className={styles.head}>
          <Typography variant="h6" className={styles.title}>
            Подтверждение записи
          </Typography>
          <Typography variant="body2" className={styles.subtle}>
            Проверьте детали перед финальным бронированием.
          </Typography>
        </div>

        <div className={styles.metaBlock}>
          <Typography variant="body2" className={styles.metaRow}>
            <span className={styles.metaLabel}>Кинолог:</span> {cynologistName}
          </Typography>
          <Typography variant="body2" className={styles.metaRow}>
            <span className={styles.metaLabel}>Слот:</span> {slotLabel}
          </Typography>
          <Typography variant="body2" className={styles.metaHint}>
            Все времена рассчитываются по МСК (UTC+3).
          </Typography>
        </div>

        <TextField
          className={styles.input}
          label="Краткое изложение проблемы (для кинолога)"
          multiline
          minRows={4}
          value={clientProblem}
          onChange={(e) => setClientProblem(e.target.value)}
          placeholder="Опишите, что беспокоит, как давно это происходит, что уже пробовали."
        />
        <div className={styles.noticeBlock}>
          <Typography variant="body2" className={styles.noticeText}>
            После нажатия кнопки «Забронировать» вам на почту придет ссылка на Телемост. В
            назначенное время подключитесь по этой ссылке — кинолог будет ждать вас там.
          </Typography>
          <Typography variant="body2" className={styles.noticeText}>
            Если письмо со ссылкой не пришло, проверьте папку «Спам» или напишите в поддержку.
          </Typography>
        </div>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
          <Button
            variant="outlined"
            className={styles.secondaryButton}
            onClick={() => router.push(`/consultations/${encodeURIComponent(cynologistUserId)}`)}
            disabled={pending}
          >
            Назад к слотам
          </Button>
          <Button variant="contained" className={styles.primaryButton} onClick={handleSubmit} disabled={pending}>
            Забронировать
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

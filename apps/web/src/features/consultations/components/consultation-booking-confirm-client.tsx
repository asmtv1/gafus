"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { AppBackButton } from "@/shared/components/ui";
import { trackEvent } from "@gafus/analytics";

import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";

import {
  formatConsultationConfirmSlotMsk,
  isLikelyValidRuPhoneInput,
} from "@gafus/consultation-shared";
import { showErrorAlert } from "@shared/utils/sweetAlert";

import styles from "./consultation-booking-confirm-client.module.css";

const SLOT_TAKEN_MESSAGE =
  "Извините, этот слот уже занят. Выберите другое время.";

const CONSULT_NAME_MAX = 15;
const CONSULT_TEXT_MAX = 1000;
const CONSULT_PROBLEM_MIN = 10;

function isOwnerOrPetName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && t.length <= CONSULT_NAME_MAX;
}
function isProblemField(s: string): boolean {
  const t = s.trim();
  return t.length >= CONSULT_PROBLEM_MIN && t.length <= CONSULT_TEXT_MAX;
}
function isSelfHelpField(s: string): boolean {
  const t = s.trim();
  return t.length >= 1 && t.length <= CONSULT_TEXT_MAX;
}

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

export function ConsultationBookingConfirmClient({
  slotId,
  cynologistUserId,
  cynologistName,
  startAtUtc,
  endAtUtc,
}: ConsultationBookingConfirmClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? `/consultations/${cynologistUserId}/confirm`;
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [clientOwnerName, setClientOwnerName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [petName, setPetName] = useState("");
  const [petGender, setPetGender] = useState<"MALE" | "FEMALE" | "">("");
  const [petAge, setPetAge] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [clientProblem, setClientProblem] = useState("");
  const [clientSelfHelpAttempt, setClientSelfHelpAttempt] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [pending, startTransition] = useTransition();
  const [idempotencyKey] = useState<string | null>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : null,
  );

  const slotLabel = useMemo(
    () => formatConsultationConfirmSlotMsk(startAtUtc, endAtUtc),
    [startAtUtc, endAtUtc],
  );

  const slotsHref = `/consultations/${encodeURIComponent(cynologistUserId)}`;

  const canSubmit = useMemo(() => {
    return (
      isOwnerOrPetName(clientOwnerName) &&
      isLikelyValidRuPhoneInput(clientPhone) &&
      isOwnerOrPetName(petName) &&
      (petGender === "MALE" || petGender === "FEMALE") &&
      petAge.trim().length > 0 &&
      petBreed.trim().length > 0 &&
      isProblemField(clientProblem) &&
      isSelfHelpField(clientSelfHelpAttempt)
    );
  }, [
    clientOwnerName,
    clientPhone,
    petName,
    petGender,
    petAge,
    petBreed,
    clientProblem,
    clientSelfHelpAttempt,
  ]);

  useEffect(() => {
    if (canSubmit) {
      setShowFieldErrors(false);
    }
  }, [canSubmit]);

  const handleSlotUnavailable = useCallback(async () => {
    await showErrorAlert(SLOT_TAKEN_MESSAGE);
    router.push(slotsHref);
  }, [router, slotsHref]);

  const onPrimaryClick = useCallback(() => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen: pathname,
      elementId: "consultation-booking-confirm-submit",
    });
    if (pending) {
      return;
    }
    if (!canSubmit) {
      setShowFieldErrors(true);
      return;
    }
    if (!idempotencyKey) {
      setServerError("Не удалось подготовить безопасный ключ запроса. Обновите страницу.");
      return;
    }
    setServerError(null);
    setShowFieldErrors(false);
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
            setServerError(vJson.error ?? "Не удалось проверить слот");
            return;
          }

          if (!csrfToken) {
            await fetchToken();
          }
          const token = csrfToken ?? useCSRFStore.getState().token;
          if (!token) {
            setServerError("Нет CSRF-токена");
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
              clientOwnerName: clientOwnerName.trim(),
              clientPhone: clientPhone.trim(),
              petName: petName.trim(),
              petGender,
              petAge: petAge.trim(),
              petBreed: petBreed.trim(),
              clientProblem: clientProblem.trim(),
              clientSelfHelpAttempt: clientSelfHelpAttempt.trim(),
            }),
          });
          const json = (await res.json()) as BookResponse;
          if (!res.ok || !json.success) {
            if (res.status === 409 || json.code === "CONSULTATION_SLOT_TAKEN") {
              await handleSlotUnavailable();
              return;
            }
            setServerError(json.error ?? "Не удалось забронировать");
            return;
          }
          trackEvent({
            eventName: "booking_confirm",
            platform: "web",
            pathOrScreen: pathname,
          });
          router.push("/consultations/my");
        } catch (e) {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "consultation",
            keys: { operation: "confirmBooking" },
          });
          setServerError("Ошибка бронирования");
        }
      })();
    });
  }, [
    canSubmit,
    clientOwnerName,
    clientPhone,
    clientProblem,
    clientSelfHelpAttempt,
    csrfToken,
    cynologistUserId,
    fetchToken,
    handleSlotUnavailable,
    idempotencyKey,
    petAge,
    petBreed,
    petGender,
    petName,
    router,
    pathname,
    slotId,
  ]);

  const phoneFieldError =
    (showFieldErrors && !isLikelyValidRuPhoneInput(clientPhone)) ||
    (clientPhone.length > 0 && !isLikelyValidRuPhoneInput(clientPhone));

  const onPetGender = useCallback((e: SelectChangeEvent<string>) => {
    const v = e.target.value;
    if (v === "MALE" || v === "FEMALE") {
      setPetGender(v);
    }
  }, []);

  return (
    <Box className={styles.card}>
      <Stack spacing={2.25}>
        <div className={styles.head}>
          <Typography variant="h6" className={styles.title}>
            Подтверждение записи
          </Typography>
          <Typography variant="body2" className={styles.subtle}>
            Заполните данные владельца и питомца — кинолог увидит их в заявке.
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
          label="Имя владельца *"
          value={clientOwnerName}
          onChange={(e) => setClientOwnerName(e.target.value.slice(0, CONSULT_NAME_MAX))}
          fullWidth
          autoComplete="name"
          inputProps={{ maxLength: CONSULT_NAME_MAX }}
          error={showFieldErrors && !isOwnerOrPetName(clientOwnerName)}
          helperText={
            showFieldErrors && !isOwnerOrPetName(clientOwnerName)
              ? "От 2 до 15 символов"
              : undefined
          }
        />
        <TextField
          className={styles.input}
          label="Номер телефона для связи *"
          value={clientPhone}
          onChange={(e) => setClientPhone(e.target.value)}
          placeholder="+7 … или +998 … (с кодом страны)"
          fullWidth
          type="tel"
          inputMode="tel"
          error={phoneFieldError}
          helperText={
            phoneFieldError
              ? "Укажите номер с кодом страны, например +7 или +998"
              : undefined
          }
        />
        <TextField
          className={styles.input}
          label="Имя питомца *"
          value={petName}
          onChange={(e) => setPetName(e.target.value.slice(0, CONSULT_NAME_MAX))}
          fullWidth
          inputProps={{ maxLength: CONSULT_NAME_MAX }}
          error={showFieldErrors && !isOwnerOrPetName(petName)}
          helperText={showFieldErrors && !isOwnerOrPetName(petName) ? "От 2 до 15 символов" : undefined}
        />
        <FormControl
          fullWidth
          className={styles.input}
          error={showFieldErrors && petGender === ""}
          variant="outlined"
        >
          {/*
            shrink: при value="" и displayEmpty + renderValue MUI иначе не поднимает label,
            и «Выберите пол» накладывается на подпись «Пол питомца».
          */}
          <InputLabel id="pet-gender-label" shrink>
            Пол питомца *
          </InputLabel>
          <Select<"" | "MALE" | "FEMALE">
            labelId="pet-gender-label"
            id="pet-gender"
            value={petGender}
            label="Пол питомца *"
            onChange={onPetGender}
            displayEmpty
            renderValue={(selected) => {
              if (selected === "") {
                return (
                  <Box
                    component="span"
                    sx={{
                      color: "text.secondary",
                      display: "block",
                      pt: "2px",
                    }}
                  >
                    Выберите пол
                  </Box>
                );
              }
              return selected === "MALE" ? "Мальчик" : "Девочка";
            }}
          >
            <MenuItem value="MALE">Мальчик</MenuItem>
            <MenuItem value="FEMALE">Девочка</MenuItem>
          </Select>
          {showFieldErrors && petGender === "" ? (
            <FormHelperText>Выберите пол питомца</FormHelperText>
          ) : null}
        </FormControl>
        <TextField
          className={styles.input}
          label="Возраст питомца *"
          value={petAge}
          onChange={(e) => setPetAge(e.target.value)}
          fullWidth
          placeholder="например, 2 года"
          error={showFieldErrors && !petAge.trim()}
          helperText={showFieldErrors && !petAge.trim() ? "Укажите возраст" : undefined}
        />
        <TextField
          className={styles.input}
          label="Порода *"
          value={petBreed}
          onChange={(e) => setPetBreed(e.target.value)}
          fullWidth
          error={showFieldErrors && !petBreed.trim()}
          helperText={showFieldErrors && !petBreed.trim() ? "Укажите породу" : undefined}
        />
        <TextField
          className={styles.input}
          label="Проблема *"
          multiline
          minRows={3}
          value={clientProblem}
          onChange={(e) => setClientProblem(e.target.value.slice(0, CONSULT_TEXT_MAX))}
          fullWidth
          inputProps={{ maxLength: CONSULT_TEXT_MAX }}
          error={showFieldErrors && !isProblemField(clientProblem)}
          helperText={
            showFieldErrors && !isProblemField(clientProblem)
              ? "От 10 до 1000 символов"
              : undefined
          }
        />
        <TextField
          className={styles.input}
          label="Как пытались решить сами *"
          multiline
          minRows={3}
          value={clientSelfHelpAttempt}
          onChange={(e) => setClientSelfHelpAttempt(e.target.value.slice(0, CONSULT_TEXT_MAX))}
          fullWidth
          inputProps={{ maxLength: CONSULT_TEXT_MAX }}
          error={showFieldErrors && !isSelfHelpField(clientSelfHelpAttempt)}
          helperText={
            showFieldErrors && !isSelfHelpField(clientSelfHelpAttempt)
              ? "Заполните поле, не более 1000 символов"
              : undefined
          }
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
        {showFieldErrors && !canSubmit ? (
          <Alert
            severity="warning"
            onClose={() => setShowFieldErrors(false)}
          >
            Заполните все обязательные поля — пустые поля подсвечены красным.
          </Alert>
        ) : null}
        {serverError ? (
          <Alert severity="error" onClose={() => setServerError(null)}>
            {serverError}
          </Alert>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
          <AppBackButton
            onClick={() => router.push(`/consultations/${encodeURIComponent(cynologistUserId)}`)}
            disabled={pending}
          >
            Назад к слотам
          </AppBackButton>
          <Button
            type="button"
            variant="contained"
            className={
              !canSubmit && !pending
                ? `${styles.primaryButton} ${styles.primaryButtonMuted}`
                : styles.primaryButton
            }
            onClick={onPrimaryClick}
            disabled={pending}
            title={
              !canSubmit
                ? "Нажмите, чтобы увидеть, какие поля нужно заполнить"
                : "Отправить заявку на выбранный слот"
            }
            aria-label={
              !canSubmit
                ? "Забронировать: сначала заполните все обязательные поля"
                : "Забронировать консультацию"
            }
          >
            Забронировать
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

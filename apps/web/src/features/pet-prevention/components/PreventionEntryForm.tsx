"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@gafus/analytics";

import AddIcon from "@mui/icons-material/Add";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import {
  DEFAULT_REMINDER_DAYS,
  type PetPreventionTypeKey,
} from "@gafus/core/services/petPrevention";

import {
  createPreventionEntry,
  updatePreventionEntry,
} from "@shared/lib/pet-prevention";

import { PREVENTION_TYPE_LABELS } from "../types";

import type { PreventionEntryDisplay } from "../types";

import styles from "./prevention-ui.module.css";

const REMINDER_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_REMINDER_TIMES = 5;

function normalizeReminderTimes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const valid = raw.filter(
      (t): t is string => typeof t === "string" && REMINDER_TIME_RE.test(t),
    );
    if (valid.length > 0) {
      return valid;
    }
  }
  return ["09:00"];
}

/** Нормализует значение из input type="time" к ЧЧ:ММ для API */
function toApiTime(value: string): string {
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return trimmed;
  }
  const h = m[1].padStart(2, "0");
  return `${h}:${m[2]}`;
}

const switchSx = {
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: "#636128",
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: "#b6c582",
    opacity: 1,
  },
} as const;

interface PreventionEntryFormProps {
  petId: string;
  entry?: PreventionEntryDisplay | null;
  onSuccess: () => void;
  onCancel: () => void;
  open: boolean;
}

const PREVENTION_TYPES = ["VACCINATION", "DEWORMING", "TICKS_FLEAS"] as const;

export function PreventionEntryForm({
  petId,
  entry,
  onSuccess,
  onCancel,
  open,
}: PreventionEntryFormProps) {
  const pathname = usePathname() ?? "/pets";
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState(entry?.type ?? "VACCINATION");
  const [performedAt, setPerformedAt] = useState(
    entry?.performedAt
      ? new Date(entry.performedAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [productName, setProductName] = useState(entry?.productName ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [reminderEnabled, setReminderEnabled] = useState(
    entry?.reminderEnabled ?? true,
  );
  const [reminderKind, setReminderKind] = useState<"AFTER_DAYS" | "ON_DATE">(
    (entry?.reminderKind as "AFTER_DAYS" | "ON_DATE") ?? "AFTER_DAYS",
  );
  const [reminderDaysAfter, setReminderDaysAfter] = useState(
    entry?.reminderDaysAfter ??
      DEFAULT_REMINDER_DAYS[(entry?.type as PetPreventionTypeKey) ?? "VACCINATION"],
  );
  const [reminderOnDate, setReminderOnDate] = useState(
    entry?.reminderOnDate
      ? new Date(entry.reminderOnDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [reminderTimes, setReminderTimes] = useState<string[]>(() =>
    normalizeReminderTimes(entry?.reminderTimes),
  );

  useEffect(() => {
    if (open) {
      setError(null);
      setType(entry?.type ?? "VACCINATION");
      setPerformedAt(
        entry?.performedAt
          ? new Date(entry.performedAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      );
      setProductName(entry?.productName ?? "");
      setNotes(entry?.notes ?? "");
      setReminderEnabled(entry?.reminderEnabled ?? true);
      setReminderKind(
        (entry?.reminderKind as "AFTER_DAYS" | "ON_DATE") ?? "AFTER_DAYS",
      );
      setReminderDaysAfter(
        entry?.reminderDaysAfter ??
          DEFAULT_REMINDER_DAYS[(entry?.type as PetPreventionTypeKey) ?? "VACCINATION"],
      );
      setReminderOnDate(
        entry?.reminderOnDate
          ? new Date(entry.reminderOnDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
      );
      setReminderTimes(normalizeReminderTimes(entry?.reminderTimes));
    }
  }, [open, entry]);

  useEffect(() => {
    if (!entry && open) {
      setReminderDaysAfter(DEFAULT_REMINDER_DAYS[type as PetPreventionTypeKey]);
    }
  }, [type, entry, open]);

  const handleSubmit = () => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen: pathname,
      elementId: entry ? "profile-prevention-save-edit-submit" : "profile-prevention-save-create-submit",
    });
    setError(null);
    if (!type || !performedAt) {
      setError("Тип и дата обязательны");
      return;
    }

    const normalizedTimes = reminderTimes.map(toApiTime);
    const invalidTime = normalizedTimes.find((t) => !REMINDER_TIME_RE.test(t));
    if (invalidTime) {
      setError("Укажите корректное время (ЧЧ:ММ) для всех напоминаний");
      return;
    }
    if (normalizedTimes.length < 1 || normalizedTimes.length > MAX_REMINDER_TIMES) {
      setError(`От 1 до ${MAX_REMINDER_TIMES} времён напоминания`);
      return;
    }

    const payload: Record<string, unknown> = {
      type,
      performedAt,
      productName: productName.trim() || undefined,
      notes: notes.trim() || undefined,
      reminderEnabled,
      reminderKind,
      reminderTimes: normalizedTimes,
    };
    if (reminderEnabled) {
      if (reminderKind === "AFTER_DAYS") {
        payload.reminderDaysAfter = reminderDaysAfter;
        payload.reminderOnDate = undefined;
      } else {
        payload.reminderOnDate = reminderOnDate;
        payload.reminderDaysAfter = undefined;
      }
    } else {
      payload.reminderDaysAfter = undefined;
      payload.reminderOnDate = undefined;
    }

    startTransition(async () => {
      const result = entry
        ? await updatePreventionEntry(petId, entry.id, payload)
        : await createPreventionEntry(petId, payload);

      if (result.success) {
        trackEvent({
          eventName: "button_click",
          platform: "web",
          pathOrScreen: pathname,
          elementId: `profile-prevention-save-success-${type.toLowerCase()}`,
        });
        onSuccess();
      } else {
        setError(result.error ?? "Ошибка сохранения");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          className: styles.dialogPaper,
        },
      }}
    >
      <DialogTitle className={styles.dialogTitle}>
        {entry ? "Редактировать запись" : "Добавить запись"}
      </DialogTitle>
      <DialogContent className={styles.dialogContent}>
        <Box
          className={styles.formRoot}
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <p className={styles.disclaimer}>
            Это не замена консультации ветеринара: дозировки и сроки назначает только врач.
          </p>

          <FormControl fullWidth>
            <InputLabel>Тип</InputLabel>
            <Select
              autoFocus
              value={type}
              label="Тип"
              onChange={(e) => setType(e.target.value)}
              MenuProps={{
                PaperProps: {
                  sx: {
                    borderRadius: 2,
                    border: "1px solid #d4c4a8",
                    background: "linear-gradient(145deg, #fffdf8 0%, #f5f0e8 100%)",
                  },
                },
              }}
            >
              {PREVENTION_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {PREVENTION_TYPE_LABELS[t]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Дата"
            type="date"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />

          <TextField
            label="Препарат"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Название препарата (опционально)"
            fullWidth
          />

          <TextField
            label="Заметки"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Дополнительные заметки"
            multiline
            rows={2}
            fullWidth
          />

          <div className={styles.switchRow}>
            <FormControlLabel
              control={
                <Switch
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  sx={switchSx}
                />
              }
              label="Push-напоминание"
            />
          </div>

          {reminderEnabled && (
            <>
              <FormControl fullWidth>
                <InputLabel>Когда напомнить</InputLabel>
                <Select
                  value={reminderKind}
                  label="Когда напомнить"
                  onChange={(e) =>
                    setReminderKind(e.target.value as "AFTER_DAYS" | "ON_DATE")
                  }
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        borderRadius: 2,
                        border: "1px solid #d4c4a8",
                        background: "linear-gradient(145deg, #fffdf8 0%, #f5f0e8 100%)",
                      },
                    },
                  }}
                >
                  <MenuItem value="AFTER_DAYS">Через N дней после даты сделанного</MenuItem>
                  <MenuItem value="ON_DATE">В конкретную дату</MenuItem>
                </Select>
              </FormControl>

              {reminderKind === "AFTER_DAYS" && (
                <TextField
                  label="Дней после процедуры"
                  type="number"
                  inputProps={{ min: 1, max: 1095 }}
                  value={reminderDaysAfter}
                  onChange={(e) =>
                    setReminderDaysAfter(parseInt(e.target.value, 10) || 1)
                  }
                  required
                  fullWidth
                />
              )}

              {reminderKind === "ON_DATE" && (
                <TextField
                  label="Дата напоминания"
                  type="date"
                  value={reminderOnDate}
                  onChange={(e) => setReminderOnDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              )}

              <p className={styles.timeSectionLabel}>Во сколько напомнить</p>
              <Typography variant="caption" display="block" sx={{ color: "#636128", mb: 1 }}>
                Можно несколько раз в день (например, утром и вечером). Время — по Москве, как в
                расписании отправки.
              </Typography>
              {reminderTimes.map((t, idx) => (
                <div key={idx} className={styles.timeRow}>
                  <TextField
                    className={styles.timeRowField}
                    label={`Время ${idx + 1}`}
                    type="time"
                    value={t}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReminderTimes((prev) => {
                        const next = [...prev];
                        next[idx] = v;
                        return next;
                      });
                    }}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ step: 300 }}
                    fullWidth
                  />
                  {reminderTimes.length > 1 && (
                    <IconButton
                      aria-label="Убрать время"
                      onClick={() =>
                        setReminderTimes((prev) => prev.filter((_, i) => i !== idx))
                      }
                      sx={{ mt: 0.5, color: "#8b4513" }}
                      size="small"
                    >
                      <CloseRoundedIcon fontSize="small" />
                    </IconButton>
                  )}
                </div>
              ))}
              {reminderTimes.length < MAX_REMINDER_TIMES && (
                <Button
                  type="button"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    setReminderTimes((prev) => [...prev, "18:00"])
                  }
                  className={styles.addTimeButton}
                >
                  Ещё одно напоминание
                </Button>
              )}
            </>
          )}

          {error && <p className={styles.errorText}>{error}</p>}
        </Box>
      </DialogContent>
      <DialogActions className={styles.dialogActions}>
        <Button
          onClick={onCancel}
          disabled={isPending}
          className={styles.btnSecondary}
        >
          Отмена
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isPending}
          className={styles.btnPrimary}
          disableElevation
        >
          {isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

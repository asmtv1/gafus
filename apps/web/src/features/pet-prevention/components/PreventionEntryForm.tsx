"use client";

import { useEffect, useState, useTransition } from "react";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
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
    }
  }, [open, entry]);

  useEffect(() => {
    if (!entry && open) {
      setReminderDaysAfter(DEFAULT_REMINDER_DAYS[type as PetPreventionTypeKey]);
    }
  }, [type, entry, open]);

  const handleSubmit = () => {
    setError(null);
    if (!type || !performedAt) {
      setError("Тип и дата обязательны");
      return;
    }

    const payload: Record<string, unknown> = {
      type,
      performedAt,
      productName: productName.trim() || undefined,
      notes: notes.trim() || undefined,
      reminderEnabled,
      reminderKind,
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

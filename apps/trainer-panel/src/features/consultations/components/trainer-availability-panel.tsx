"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";
import { useRouter } from "next/navigation";

import type {
  ConsultationAvailabilityRuleDto,
  ConsultationSlotDto,
  DayOffDto,
  SlotExceptionDto,
} from "@gafus/core";
import { reportClientError } from "@gafus/error-handling";

import {
  addDayOffAction,
  addSlotExceptionAction,
  removeDayOffAction,
  removeSlotExceptionAction,
  saveTrainerAvailabilityAction,
} from "../lib/trainer-availability-actions";
import {
  CONSULTATION_TIMEZONE,
  enumerateIsoDayKeysInclusive,
  moscowTodayKey,
  utcInstantToMoscowDayKey,
} from "../lib/msk-day-range";

import styles from "./trainer-availability-panel.module.css";

const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const CALENDAR_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function defaultRules(): Omit<ConsultationAvailabilityRuleDto, "id">[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "18:00",
    isWorkingDay: weekday >= 1 && weekday <= 5,
  }));
}

function rulesToFormState(
  rules: ConsultationAvailabilityRuleDto[],
): Omit<ConsultationAvailabilityRuleDto, "id">[] {
  const defaults = defaultRules();
  const byDay = new Map(rules.map((r) => [r.weekday, r]));
  return defaults.map((d) => {
    const existing = byDay.get(d.weekday);
    if (!existing) {
      return d;
    }
    return {
      weekday: existing.weekday,
      startTime: existing.startTime,
      endTime: existing.endTime,
      isWorkingDay: existing.isWorkingDay,
    };
  });
}

export interface TrainerAvailabilityInitial {
  slotDurationMin: number;
  rules: ConsultationAvailabilityRuleDto[];
  dayOffs: DayOffDto[];
  exceptions: SlotExceptionDto[];
}

interface TrainerAvailabilityPanelProps {
  initial: TrainerAvailabilityInitial;
  editableSlots: ConsultationSlotDto[];
  /** Календарные границы блока «Недоступные слоты» (МСК, YYYY-MM-DD), согласованы с сервером */
  slotPickerMinDayKey: string;
  slotPickerMaxDayKey: string;
}

/**
 * Редактирование недельного расписания, выходных и исключений для слотов консультаций.
 */
export function TrainerAvailabilityPanel({
  initial,
  editableSlots,
  slotPickerMinDayKey,
  slotPickerMaxDayKey,
}: TrainerAvailabilityPanelProps) {
  const router = useRouter();
  const [rules, setRules] = useState(() => rulesToFormState(initial.rules));
  const [dayOffMonthCursor, setDayOffMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDayOffDates, setSelectedDayOffDates] = useState<string[]>([]);
  const [selectedDayForSlots, setSelectedDayForSlots] = useState<string>("");
  const [selectedUnavailableSlotIds, setSelectedUnavailableSlotIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRules(rulesToFormState(initial.rules));
  }, [initial.rules]);

  const updateRule = useCallback(
    (weekday: number, patch: Partial<Omit<ConsultationAvailabilityRuleDto, "id" | "weekday">>) => {
      setRules((prev) =>
        prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const handleSaveRules = useCallback(() => {
    setError(null);
    startTransition(() => {
      void (async () => {
        const res = await saveTrainerAvailabilityAction({ rules });
        if (!res.success) {
          setError(res.error);
          return;
        }
        router.refresh();
      })().catch((e) => {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "TrainerAvailability",
          keys: { operation: "saveRules" },
        });
        setError("Ошибка сохранения");
      });
    });
  }, [rules, router]);

  const handleAddDayOff = useCallback(() => {
    if (selectedDayOffDates.length === 0) {
      setError("Выберите хотя бы один день в календаре");
      return;
    }
    setError(null);
    startTransition(() => {
      void (async () => {
        for (const date of selectedDayOffDates) {
          const res = await addDayOffAction(date);
          if (!res.success) {
            setError(res.error);
            return;
          }
        }
        setSelectedDayOffDates([]);
        router.refresh();
      })().catch((e) => {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "TrainerAvailability",
          keys: { operation: "addDayOff" },
        });
        setError("Ошибка");
      });
    });
  }, [router, selectedDayOffDates]);

  const handleRemoveDayOff = useCallback(
    (id: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          const res = await removeDayOffAction(id);
          if (!res.success) {
            setError(res.error);
            return;
          }
          router.refresh();
        })().catch((e) => {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "TrainerAvailability",
            keys: { operation: "removeDayOff" },
          });
          setError("Ошибка");
        });
      });
    },
    [router],
  );

  const handleAddExceptions = useCallback(() => {
    if (selectedUnavailableSlotIds.length === 0) {
      setError("Выберите хотя бы один слот");
      return;
    }
    setError(null);
    startTransition(() => {
      void (async () => {
        const byId = new Map(editableSlots.map((slot) => [slot.id, slot]));
        for (const slotId of selectedUnavailableSlotIds) {
          const slot = byId.get(slotId);
          if (!slot) {
            continue;
          }
          const res = await addSlotExceptionAction(slot.startAtUtc, slot.endAtUtc);
          if (!res.success) {
            setError(res.error);
            return;
          }
        }
        setSelectedUnavailableSlotIds([]);
        router.refresh();
      })().catch((e) => {
        reportClientError(e instanceof Error ? e : new Error(String(e)), {
          issueKey: "TrainerAvailability",
          keys: { operation: "addExceptionsBatch" },
        });
        setError("Ошибка");
      });
    });
  }, [editableSlots, router, selectedUnavailableSlotIds]);

  const handleRemoveException = useCallback(
    (id: string) => {
      setError(null);
      startTransition(() => {
        void (async () => {
          const res = await removeSlotExceptionAction(id);
          if (!res.success) {
            setError(res.error);
            return;
          }
          router.refresh();
        })().catch((e) => {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "TrainerAvailability",
            keys: { operation: "removeException" },
          });
          setError("Ошибка");
        });
      });
    },
    [router],
  );

  const sortedRules = useMemo(
    () =>
      [...rules].sort(
        (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7),
      ),
    [rules],
  );

  const todayKey = moscowTodayKey();

  const existingDayOffDates = useMemo(
    () => new Set(initial.dayOffs.map((d) => d.date)),
    [initial.dayOffs],
  );

  const dayOffMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
      }).format(dayOffMonthCursor),
    [dayOffMonthCursor],
  );

  const dayOffMonthCells = useMemo(() => {
    const year = dayOffMonthCursor.getFullYear();
    const month = dayOffMonthCursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const leadingEmpty = (first.getDay() + 6) % 7;
    const out: Array<Date | null> = [];

    for (let i = 0; i < leadingEmpty; i += 1) {
      out.push(null);
    }
    for (let day = 1; day <= last.getDate(); day += 1) {
      out.push(new Date(year, month, day));
    }

    return out;
  }, [dayOffMonthCursor]);

  const toggleDayOffDate = useCallback((dateKey: string) => {
    setSelectedDayOffDates((prev) =>
      prev.includes(dateKey) ? prev.filter((v) => v !== dateKey) : [...prev, dateKey],
    );
  }, []);

  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, ConsultationSlotDto[]>();
    for (const slot of editableSlots) {
      const dateKey = utcInstantToMoscowDayKey(slot.startAtUtc);
      if (dateKey < slotPickerMinDayKey || dateKey > slotPickerMaxDayKey) {
        continue;
      }
      const bucket = grouped.get(dateKey);
      if (bucket) {
        bucket.push(slot);
      } else {
        grouped.set(dateKey, [slot]);
      }
    }
    const allKeys = enumerateIsoDayKeysInclusive(slotPickerMinDayKey, slotPickerMaxDayKey);
    return allKeys.map((dateKey) => ({
      dateKey,
      slots: [...(grouped.get(dateKey) ?? [])].sort((a, b) =>
        a.startAtUtc.localeCompare(b.startAtUtc),
      ),
    }));
  }, [editableSlots, slotPickerMaxDayKey, slotPickerMinDayKey]);

  const slotsByDayMap = useMemo(
    () => new Map(slotsByDay.map((entry) => [entry.dateKey, entry.slots])),
    [slotsByDay],
  );

  useEffect(() => {
    if (slotsByDay.length === 0) {
      setSelectedDayForSlots("");
      return;
    }
    const keys = new Set(slotsByDay.map((e) => e.dateKey));
    setSelectedDayForSlots((prev) =>
      prev && keys.has(prev) ? prev : (slotsByDay[0]?.dateKey ?? ""),
    );
  }, [slotsByDay]);

  const selectedDaySlots = useMemo(
    () => slotsByDayMap.get(selectedDayForSlots) ?? [],
    [selectedDayForSlots, slotsByDayMap],
  );

  const formatSlotDayLabel = useCallback((dayKey: string) => {
    const date = new Date(`${dayKey}T12:00:00+03:00`);
    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: CONSULTATION_TIMEZONE,
    }).format(date);
  }, []);

  const formatSlotTimeRange = useCallback((startAtUtc: string, endAtUtc: string) => {
    const start = new Date(startAtUtc);
    const end = new Date(endAtUtc);
    const fmt = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    });
    return `${fmt.format(start)} - ${fmt.format(end)}`;
  }, []);

  const toggleUnavailableSlot = useCallback((slotId: string) => {
    setSelectedUnavailableSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((v) => v !== slotId) : [...prev, slotId],
    );
  }, []);

  return (
    <div className={styles.root}>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      <p className={styles.meta}>
        Часовой пояс: <strong>МСК (UTC+3)</strong>. Длительность слота:{" "}
        <strong>{initial.slotDurationMin}</strong> мин.
      </p>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Недельное расписание</h2>
        <Stack spacing={1.25}>
          {sortedRules.map((r) => (
            <div key={r.weekday} className={styles.ruleRow}>
              <span className={styles.weekday}>{WEEKDAY_LABELS[r.weekday]}</span>
              <TextField
                size="small"
                label="С"
                value={r.startTime}
                onChange={(e) => updateRule(r.weekday, { startTime: e.target.value })}
              />
              <TextField
                size="small"
                label="До"
                value={r.endTime}
                onChange={(e) => updateRule(r.weekday, { endTime: e.target.value })}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={r.isWorkingDay}
                    onChange={(_, c) => updateRule(r.weekday, { isWorkingDay: c })}
                    color="primary"
                  />
                }
                label="Рабочий день"
              />
            </div>
          ))}
        </Stack>
        <Button
          className={styles.saveButton}
          variant="contained"
          color="primary"
          disabled={pending}
          onClick={handleSaveRules}
        >
          {pending ? "Сохранение…" : "Сохранить расписание"}
        </Button>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Выходные</h2>
        <div className={styles.dayOffCalendar}>
          <div className={styles.dayOffCalendarHeader}>
            <Button
              size="small"
              onClick={() => {
                setDayOffMonthCursor(
                  new Date(dayOffMonthCursor.getFullYear(), dayOffMonthCursor.getMonth() - 1, 1),
                );
              }}
            >
              {"<"}
            </Button>
            <span className={styles.dayOffCalendarMonth}>{dayOffMonthLabel}</span>
            <Button
              size="small"
              onClick={() => {
                setDayOffMonthCursor(
                  new Date(dayOffMonthCursor.getFullYear(), dayOffMonthCursor.getMonth() + 1, 1),
                );
              }}
            >
              {">"}
            </Button>
          </div>
          <div className={styles.dayOffCalendarWeekdays}>
            {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className={styles.dayOffCalendarGrid}>
            {dayOffMonthCells.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className={styles.dayOffCalendarEmptyCell} />;
              }

              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              const dateKey = `${y}-${m}-${d}`;
              const isPast = dateKey < todayKey;
              const isExisting = existingDayOffDates.has(dateKey);
              const isSelected = selectedDayOffDates.includes(dateKey);
              const isDisabled = isPast || isExisting;

              return (
                <button
                  key={dateKey}
                  type="button"
                  className={styles.dayOffCalendarCell}
                  disabled={isDisabled}
                  data-selected={isSelected}
                  data-existing={isExisting}
                  onClick={() => toggleDayOffDate(dateKey)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          variant="outlined"
          color="primary"
          disabled={pending || selectedDayOffDates.length === 0}
          onClick={handleAddDayOff}
          sx={{ mt: 1.5 }}
        >
          Добавить выбранные дни
        </Button>
        <ul className={styles.list}>
          {initial.dayOffs.map((d) => (
            <li key={d.id}>
              <span>{d.date}</span>
              <Button
                size="small"
                variant="text"
                color="error"
                className={styles.inlineButton}
                onClick={() => handleRemoveDayOff(d.id)}
              >
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Недоступные слоты</h2>
        <p className={styles.caption}>
          Список дней: с сегодняшнего (МСК) и на 14 дней вперёд — все дни показываются, даже если свободных
          слотов уже нет (занято исключениями). Отметьте интервалы, которые нужно скрыть для записи.
        </p>
        <div className={styles.slotDays}>
          {slotsByDay.map((entry) => (
            <button
              key={entry.dateKey}
              type="button"
              className={styles.slotDayButton}
              data-selected={selectedDayForSlots === entry.dateKey}
              onClick={() => setSelectedDayForSlots(entry.dateKey)}
            >
              {formatSlotDayLabel(entry.dateKey)}
            </button>
          ))}
        </div>
        <div className={styles.slotChoices}>
          {selectedDaySlots.length === 0 ? (
            <p className={styles.caption}>Для выбранного дня доступных слотов нет.</p>
          ) : (
            selectedDaySlots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={styles.slotChoice}
                data-selected={selectedUnavailableSlotIds.includes(slot.id)}
                onClick={() => toggleUnavailableSlot(slot.id)}
              >
                {formatSlotTimeRange(slot.startAtUtc, slot.endAtUtc)}
              </button>
            ))
          )}
        </div>
        <Button
          variant="outlined"
          color="primary"
          disabled={pending || selectedUnavailableSlotIds.length === 0}
          onClick={handleAddExceptions}
          sx={{ mt: 1.5 }}
        >
          Сделать выбранные слоты недоступными
        </Button>
        <ul className={styles.list}>
          {initial.exceptions.map((ex) => (
            <li key={ex.id}>
              <span>
                {new Date(ex.startAtUtc).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} —{" "}
                {new Date(ex.endAtUtc).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}
              </span>
              <Button
                size="small"
                variant="text"
                color="error"
                className={styles.inlineButton}
                onClick={() => handleRemoveException(ex.id)}
              >
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
